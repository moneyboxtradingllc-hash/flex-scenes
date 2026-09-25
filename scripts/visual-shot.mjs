import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ?? "/";
const referenceCaptures = [
  { width: 1440, height: 960, name: "home-v2-desktop-1440", liveName: "home-v2-live-1440" },
  { width: 1680, height: 1050, name: "home-v2-desktop-1680", liveName: "home-v2-live-1680" },
  { width: 393, height: 852, name: "home-v2-mobile-393" },
];
const geometryCaptures = [
  { width: 1440, height: 960, name: "home-geometry-1440" },
  { width: 1680, height: 1050, name: "home-geometry-1680" },
  { width: 2560, height: 1440, name: "home-v2-actual-ultrawide" },
];
const mobileHomeCaptures = [
  { width: 393, height: 852, name: "home-mobile-clean-393" },
  { width: 390, height: 844, name: "home-mobile-clean-390" },
];
const desktopV3Captures = [
  { width: 1440, height: 960, name: "home-desktop-v3-1440" },
  { width: 1680, height: 1050, name: "home-desktop-v3-1680" },
  { width: 2560, height: 1440, name: "home-desktop-v3-2560" },
];
const mobileV3Captures = [
  { width: 390, height: 844, name: "mobile-v3-home-390" },
  { width: 393, height: 852, name: "mobile-v3-home-393" },
  { width: 430, height: 932, name: "mobile-v3-home-430" },
];
const homeTopbarCapture = [{ width: 393, height: 852, name: "home-topbar-at-top-393" }];
const exploreV3Captures = [
  { width: 390, height: 844, name: "mobile-v3-explore-390" },
  { width: 393, height: 852, name: "mobile-v3-explore-393" },
  { width: 430, height: 932, name: "mobile-v3-explore-430" },
];
const captures = process.argv.includes("--home-v2")
  ? referenceCaptures
  : process.argv.includes("--desktop-v3")
    ? desktopV3Captures
  : process.argv.includes("--home-topbar")
    ? homeTopbarCapture
  : process.argv.includes("--explore-v3")
    ? exploreV3Captures
  : process.argv.includes("--mobile-v3")
    ? mobileV3Captures
  : process.argv.includes("--mobile-home")
    ? mobileHomeCaptures
  : process.argv.includes("--geometry")
    ? geometryCaptures
    : (process.argv.includes("--all") ? [360, 393, 430, 768, 1024, 1440, 1680] : [Number(process.argv[3] ?? 393)])
      .map((width) => ({ width, height: width < 768 ? 852 : 960 }));
const outputDir = path.join(root, ".artifacts", "visual");
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = Number(portArg?.split("=")[1] ?? 3210);
const hostnameArg = process.argv.find((arg) => arg.startsWith("--hostname="));
const hostname = hostnameArg?.split("=")[1] ?? "127.0.0.1";
const urlHostArg = process.argv.find((arg) => arg.startsWith("--url-host="));
const urlHost = urlHostArg?.split("=")[1] ?? "127.0.0.1";
const baseUrl = `http://${urlHost}:${port}`;
const baseOrigin = new URL(baseUrl).origin;
const expectedCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

async function currentWorktreeId() {
  const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/).filter((file) => /^(app|components|scripts|lib|public)\/|^(package(?:-lock)?\.json|next\.config\.)/.test(file)).sort();
  const hash = createHash("sha256");
  for (const file of tracked) {
    hash.update(file);
    hash.update(await readFile(path.join(root, file)));
  }
  return hash.digest("hex");
}

async function waitForOwnedApp(child, worktreeId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Isolated Next server exited early (${child.exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/api/qa/build-info`, { cache: "no-store" });
      if (response.ok) {
        const info = await response.json();
        if (info.commit !== expectedCommit || info.worktreeId !== worktreeId) {
          throw new Error(`QA server provenance mismatch: expected ${expectedCommit}/${worktreeId}, got ${info.commit}/${info.worktreeId}`);
        }
        return info;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("provenance mismatch")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The isolated worktree server did not become ready at ${baseUrl}`);
}

const worktreeId = await currentWorktreeId();
const child = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "--hostname", hostname, "--port", String(port)], {
  cwd: root,
  detached: process.platform === "win32",
  stdio: "ignore",
  windowsHide: true,
  env: { ...process.env, FLEX_SCENES_QA_WORKTREE_ID: worktreeId, ...(hostname === "0.0.0.0" ? { FLEX_SCENES_LAN_IP: urlHost } : {}) },
});

let browser;
try {
  const identity = await waitForOwnedApp(child, worktreeId);
  console.log(`Visual QA server: ${baseUrl} (commit ${identity.commit}, worktree ${identity.worktreeId})`);
  await mkdir(outputDir, { recursive: true });
  if (target === "/" && !process.argv.includes("--live")) {
    for (const file of await readdir(outputDir)) {
      if (/^home-(360|393|430|768|1024|1440|1680|live-393)\.png$/.test(file)) await rm(path.join(outputDir, file));
      if (process.argv.includes("--geometry") && /^home-(geometry-1440|geometry-1680|v2-actual-ultrawide)\.png$/.test(file)) await rm(path.join(outputDir, file));
    }
  }
  browser = await chromium.launch({ headless: true });
  for (const capture of captures) {
    const { width, height } = capture;
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: width < 768 ? 2 : 1,
      isMobile: width < 768,
      hasTouch: width <= 768,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(new URL(target, baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1300);
    if (errors.length) throw new Error(`Browser errors at ${width}px: ${errors.join(" | ")}`);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const storyImages = await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll(".home-v2-mobile .home-v2-stories img"));
      await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
      return images.map((image) => ({ src: image.currentSrc, complete: image.complete, width: image.naturalWidth }));
    });
    const brokenStoryImages = storyImages.filter((image) => !image.complete || image.width === 0 || !image.src.startsWith(`${baseOrigin}/fixtures/story-avatar-`));
    if (brokenStoryImages.length) throw new Error(`Broken or non-local mobile story avatars at ${width}px: ${JSON.stringify(brokenStoryImages)}`);
    if ((process.argv.includes("--mobile-home") || process.argv.includes("--mobile-v3")) && storyImages.length !== 7) throw new Error(`Expected seven loaded avatar portraits in the development story rail at ${width}px, got ${storyImages.length}`);
    const storyLabels = await page.locator(".home-v2-mobile .home-v2-story > span:last-child").allTextContents();
    if (storyLabels.some((label) => /demo|fixture|\bid\b/i.test(label))) throw new Error(`Development terminology leaked into story labels at ${width}px: ${storyLabels.join(", ")}`);
    const clippedStoryLabels = await page.locator(".home-v2-mobile .home-v2-story > span:last-child").evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent));
    if (clippedStoryLabels.length) throw new Error(`Clipped mobile story labels at ${width}px: ${clippedStoryLabels.join(", ")}`);
    const brokenImages = await page.evaluate(() => Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.currentSrc || img.src));
    if (brokenImages.length) throw new Error(`Broken images at ${width}px: ${brokenImages.join(", ")}`);
    if (target === "/") {
      if (await page.locator('[data-home-architecture="dedicated"]').count() !== 1) throw new Error("Dedicated Home V2 architecture missing from rendered route");
      if (width < 768 && await page.getByRole("navigation", { name: "Main navigation" }).locator("button").count() !== 5) throw new Error("Mobile navigation must contain five actions");
      if (width >= 768 && process.argv.includes("--desktop-v3") && (!(await page.locator(".home-v2-left-nav").isVisible()) || !(await page.locator(".home-v2-workspace-toolbar").isVisible()) || !(await page.locator(".home-v2-feature-card").isVisible()) || await page.locator(".home-v2-right-rail").isVisible())) throw new Error("Desktop V3 shell or media/context split did not render");
      if (width >= 768 && !process.argv.includes("--desktop-v3") && (!(await page.locator(".home-v2-left-nav").isVisible()) || !(await page.locator(".home-v2-right-rail").isVisible()))) throw new Error("Dedicated desktop Home rails did not render");
      if (await page.locator(".home-v2-right-rail .home-v2-character-card").count() > 1) throw new Error("Unexpected duplicate Home character card");
    }
    const metrics = await page.evaluate(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { width: Math.round(box.width), height: Math.round(box.height), left: Math.round(box.left), top: Math.round(box.top) };
      };
      const mobile = innerWidth < 768;
      const surface = mobile ? ".home-v2-mobile" : ".home-v2-desktop";
      const rightRail = document.querySelector(".home-v2-right-rail");
      const leftNav = rect(".home-v2-left-nav");
      const center = rect(".home-v2-center");
      const feed = rect(mobile ? ".home-v2-post" : (document.querySelector(".home-v2-feature-card") ? ".home-v2-feature-card" : ".home-v2-post"));
      const storyRail = rect(".home-v2-stories");
      const right = rect(".home-v2-right-rail");
      return {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        header: rect(mobile ? ".mobile-top-bar" : ".home-v2-top-actions"),
        storyRing: rect(surface + " .home-v2-story-ring"),
        media: rect(surface + " .home-v2-media"),
        create: rect(mobile ? ".mobile-bottom-dock .is-create .mobile-dock-icon" : ".home-v2-mobile-nav .is-create > span"),
        leftNav,
        centerGrid: center,
        feedCard: feed,
        feedRatio: feed ? Number((feed.width / innerWidth).toFixed(4)) : 0,
        centerLeft: center?.left ?? null,
        rightRail: right,
        rightRailLeft: right?.left ?? null,
        storyRail,
        storyItems: document.querySelectorAll(surface + " .home-v2-story").length,
        rightRailDisplay: rightRail ? getComputedStyle(rightRail).display : null,
        contextChildren: rightRail?.children.length ?? 0,
        workspace: rect(".home-v2-workspace-inner"),
        mediaColumn: rect(".home-v2-feature-media-column"),
        contextColumn: rect(".home-v2-feature-context"),
        homeMarker: !!document.querySelector('[data-ui-v2="home"]')
      };
    });
    if (metrics.document > metrics.viewport + 1) throw new Error(`Horizontal overflow at ${width}px: ${metrics.document}px document / ${metrics.viewport}px viewport`);
    if (target === "/" && process.argv.includes("--desktop-v3") && width >= 1280) {
      if (!metrics.workspace || metrics.workspace.width > 1252) throw new Error(`Desktop workspace exceeds its intended 1250px max width at ${width}px: ${JSON.stringify(metrics.workspace)}`);
      if (metrics.feedCard.width < 700 || !metrics.mediaColumn || !metrics.contextColumn) throw new Error(`Desktop media/context split is too small or missing at ${width}px: ${JSON.stringify(metrics)}`);
    }
    if (target === "/" && process.argv.includes("--geometry") && width >= 1280) {
      if (metrics.feedRatio < 0.5 || metrics.feedRatio > 0.54) throw new Error(`Desktop Home feed ratio is outside the 0.50–0.54 target at ${width}px: ${metrics.feedRatio}`);
      if (Math.abs(metrics.storyRail.left - metrics.feedCard.left) > 1 || Math.abs(metrics.storyRail.width - metrics.feedCard.width) > 1) throw new Error(`Story rail and feed geometry do not align at ${width}px`);
      if (Math.abs(metrics.rightRail.left - (metrics.feedCard.left + metrics.feedCard.width + 20)) > 2) throw new Error(`Right rail spacing is outside the 20px target at ${width}px`);
    }
    if (target === "/" && width === 393 && (!metrics.media || metrics.media.width < 0.95 * metrics.viewport)) throw new Error(`Home media is not edge-to-edge enough: ${JSON.stringify(metrics.media)}`);
    if (target === "/" && width < 768 && process.argv.includes("--mobile-home")) {
      const mobileChecks = await page.evaluate(() => {
        const rail = document.querySelector(".home-v2-mobile .home-v2-stories");
        const nav = document.querySelector(".home-v2-mobile-nav");
        const lastCaption = document.querySelector(".home-v2-mobile .home-v2-post:last-child .home-v2-caption");
        const actionButtons = Array.from(document.querySelectorAll(".home-v2-mobile .home-v2-post:first-child .home-v2-post-actions button"));
        const paddingBottom = Number.parseFloat(getComputedStyle(document.querySelector(".home-v2-mobile")).paddingBottom);
        const navHeight = nav?.getBoundingClientRect().height ?? 0;
        const navTop = nav?.getBoundingClientRect().top ?? innerHeight;
        const viewportMeta = document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
        const primaryActionsReachable = actionButtons.length >= 4 && actionButtons.every((button) => {
          const box = button.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= navTop;
        });
        window.scrollTo(0, document.documentElement.scrollHeight);
        const navButtons = Array.from(nav?.querySelectorAll("button") ?? []).map((button) => {
          const box = button.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= innerHeight;
        });
        return {
          railScrollable: !!rail && rail.scrollWidth > rail.clientWidth && ["auto", "scroll"].includes(getComputedStyle(rail).overflowX),
          navButtonsReachable: navButtons.length === 5 && navButtons.every(Boolean),
          primaryActionsReachable,
          contentClearance: paddingBottom >= navHeight + 16,
          viewportFitCover: viewportMeta.includes("viewport-fit=cover"),
          lastCaption: lastCaption ? (() => { const box = lastCaption.getBoundingClientRect(); return { bottom: Math.round(box.bottom), height: Math.round(box.height) }; })() : null,
          navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null,
        };
      });
      await page.waitForTimeout(80);
      const bottomCheck = await page.evaluate(() => {
        const caption = document.querySelector(".home-v2-mobile .home-v2-post:last-child .home-v2-caption");
        const nav = document.querySelector(".home-v2-mobile-nav");
        return { captionBottom: caption ? caption.getBoundingClientRect().bottom : null, navTop: nav ? nav.getBoundingClientRect().top : null };
      });
      if (!mobileChecks.railScrollable || !mobileChecks.navButtonsReachable || !mobileChecks.primaryActionsReachable || !mobileChecks.contentClearance || !mobileChecks.viewportFitCover) throw new Error(`Mobile Home layout check failed at ${width}px: ${JSON.stringify(mobileChecks)}`);
      if (bottomCheck.captionBottom !== null && bottomCheck.navTop !== null && bottomCheck.captionBottom > bottomCheck.navTop) throw new Error(`Bottom navigation obscures the final feed caption at ${width}px: ${JSON.stringify(bottomCheck)}`);
      console.log(`Mobile Home checks passed at ${width}px ${JSON.stringify({ storyAvatarCount: storyImages.length, storyLabels, ...mobileChecks, bottomCheck })}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(80);
    }
    const name = capture.name
      ? (process.argv.includes("--live") ? (capture.liveName ?? `${capture.name}-live`) : capture.name)
      : (target === "/" ? `home${process.argv.includes("--live") ? "-live" : ""}-${width}` : `${target.replace(/^\/+|\/+$/g, "").replaceAll("/", "-") || "home"}-${width}`);
    const output = path.join(outputDir, `${name}.png`);
    await page.screenshot({ path: output, animations: "disabled" });
    console.log(`${output} ${JSON.stringify(metrics)}`);
    if (process.argv.includes("--explore-v3") && target === "/explore" && width === 393) {
      const search = page.getByRole("searchbox", { name: "Search characters, scenes, collections, captions, prompts, and notes" });
      const filters = page.getByRole("group", { name: "Explore filters" });
      const dock = page.getByRole("navigation", { name: "Main navigation" });
      const topBar = page.locator(".mobile-top-layer.is-flow .mobile-top-bar");
      const checkNoOverflow = async (stage) => {
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        if (dimensions.document > dimensions.viewport + 1 || dimensions.body > dimensions.viewport + 1) throw new Error(`Explore horizontal overflow at ${stage}: ${JSON.stringify(dimensions)}`);
        return dimensions;
      };
      const columns = await page.locator(".explore-grid").first().evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
      if (columns !== 3) throw new Error(`Mobile Explore must use a 3-column discovery grid, got ${columns}`);
      if (await search.isVisible() !== true || !(await dock.isVisible()) || !(await dock.getByRole("button", { name: "Explore" }).getAttribute("aria-current"))) throw new Error("Explore search or active floating dock did not render");
      const initialTop = await topBar.evaluate((node) => ({ position: getComputedStyle(node.closest(".mobile-top-layer")).position, rect: node.getBoundingClientRect().toJSON() }));
      if (initialTop.position === "fixed" || initialTop.position === "sticky" || initialTop.rect.top < 0 || initialTop.rect.bottom > height) throw new Error(`Explore top bar is not in normal flow at the page top: ${JSON.stringify(initialTop)}`);
      await checkNoOverflow("initial All view");

      const chips = filters.locator("button");
      await filters.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
      const filterScroll = await filters.evaluate((node) => ({ left: node.scrollLeft, max: node.scrollWidth - node.clientWidth, pageX: window.scrollX }));
      if (filterScroll.max <= 0 || filterScroll.left <= 0 || filterScroll.pageX !== 0) throw new Error(`Explore filters did not scroll independently: ${JSON.stringify(filterScroll)}`);
      await filters.evaluate((node) => { node.scrollLeft = 0; });

      for (const [label, type] of [["Images", "image"], ["Videos", "video"], ["Favorites", "favorite"], ["Collections", "collection"]]) {
        await filters.getByRole("button", { name: label }).click();
        await page.waitForTimeout(120);
        const visibleTypes = await page.locator(".explore-media-tile").evaluateAll((nodes) => nodes.map((node) => ({ type: node.dataset.mediaType, favorite: node.dataset.favorite, collection: node.dataset.collectionMember })));
        if (type === "image" && visibleTypes.some((item) => item.type !== "image")) throw new Error("Images filter returned non-image media");
        if (type === "video" && visibleTypes.some((item) => item.type !== "video")) throw new Error("Videos filter returned non-video media");
        if (type === "favorite" && visibleTypes.some((item) => item.favorite !== "true")) throw new Error("Favorites filter returned an un-favorited asset");
        if (type === "collection" && visibleTypes.some((item) => item.collection !== "true")) throw new Error("Collections filter returned media without collection membership");
        await checkNoOverflow(`${label} filter`);
      }

      await filters.getByRole("button", { name: "Characters" }).click();
      await page.waitForTimeout(120);
      await filters.evaluate((node) => { node.scrollLeft = 0; });
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-explore-characters-393.png"), animations: "disabled" });
      if (!(await page.locator(".explore-character-card").count())) throw new Error("Characters filter has no character results");
      const characterCard = page.locator(".explore-character-card").first();
      await characterCard.click();
      if (new URL(page.url()).pathname !== "/character") throw new Error("Explore character result did not open Character Hub");
      await dock.getByRole("button", { name: "Explore" }).click();

      await filters.getByRole("button", { name: "Collections" }).click();
      await page.waitForTimeout(100);
      await filters.evaluate((node) => { node.scrollLeft = 0; });
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-explore-collections-393.png"), animations: "disabled" });
      const collectionCard = page.locator(".explore-collection-card").first();
      if (!(await collectionCard.count())) throw new Error("Collections filter has no collection results");
      await collectionCard.click();
      if (!(await page.locator(".media-detail-backdrop").isVisible())) throw new Error("Opening a collection did not preserve its media-detail behavior");
      await page.getByRole("button", { name: "Close media detail" }).click();
      await filters.getByRole("button", { name: "All" }).click();

      await search.fill("Mara");
      await page.waitForFunction(() => document.querySelector(".explore-surface")?.getAttribute("data-explore-search") === "true");
      await page.waitForTimeout(100);
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-explore-search-393.png"), animations: "disabled" });
      if (!(await page.locator(".explore-character-section.is-search-strip .explore-character-card").count())) throw new Error("Character search match did not render in the compact results strip");
      const keyboardMocked = await page.evaluate(() => {
        const descriptor = Object.getOwnPropertyDescriptor(window, "visualViewport");
        if (!descriptor?.configurable) return false;
        window.__visualViewportDescriptor = descriptor;
        const keyboardViewport = new EventTarget();
        Object.defineProperty(keyboardViewport, "height", { value: Math.max(200, window.innerHeight - 330) });
        Object.defineProperty(window, "visualViewport", { configurable: true, value: keyboardViewport });
        document.activeElement?.dispatchEvent(new Event("focusin", { bubbles: true }));
        return true;
      });
      if (keyboardMocked) {
        await page.waitForFunction(() => document.querySelector("[data-mobile-shell]")?.getAttribute("data-keyboard-open") === "true");
        if (await dock.isVisible()) throw new Error("Floating dock overlapped the search keyboard viewport");
        await checkNoOverflow("search keyboard open");
        await page.evaluate(() => {
          const original = window.__visualViewportDescriptor;
          if (original) Object.defineProperty(window, "visualViewport", original);
          delete window.__visualViewportDescriptor;
          document.activeElement?.dispatchEvent(new Event("focusin", { bubbles: true }));
        });
      }
      await page.getByRole("button", { name: "Clear search" }).click();
      await page.waitForFunction(() => document.querySelector(".explore-surface")?.getAttribute("data-explore-search") === "false");
      await search.fill("no-match-query-zzq");
      await page.waitForFunction(() => document.querySelector(".explore-surface")?.getAttribute("data-explore-search") === "true");
      await page.waitForTimeout(100);
      if (!(await page.getByText("Nothing matches these filters yet.").isVisible())) throw new Error("Explore empty state did not render for an unmatched query");
      const createFromEmpty = page.getByRole("button", { name: "Create Scene" });
      if (!(await createFromEmpty.isVisible())) throw new Error("Explore empty state did not offer Create Scene when media exists");
      await createFromEmpty.click();
      if (new URL(page.url()).pathname !== "/create") throw new Error("Explore empty-state Create Scene action did not hand off to Create Studio");
      await page.goto(new URL("/explore", baseUrl).toString(), { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(250);
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.waitForFunction(() => document.querySelector(".explore-surface")?.getAttribute("data-explore-filter") === "all");

      await page.locator(".explore-media-tile").first().click();
      if (!(await page.locator(".media-detail-backdrop").isVisible())) throw new Error("Explore media tile did not open existing Media Detail");
      await page.getByRole("button", { name: "Close media detail" }).click();
      await checkNoOverflow("media open/close");
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(120);
      const finalRow = await page.evaluate(() => ({
        bottom: document.querySelector(".explore-media-tile:last-child")?.getBoundingClientRect().bottom ?? null,
        dockTop: document.querySelector(".mobile-bottom-dock")?.getBoundingClientRect().top ?? null,
      }));
      if (finalRow.bottom !== null && finalRow.dockTop !== null && finalRow.bottom > finalRow.dockTop + 1) throw new Error(`Explore final media row cannot clear the floating dock: ${JSON.stringify(finalRow)}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);

      await page.getByRole("button", { name: "Open Flex Scenes menu" }).click();
      if (!(await page.locator("#mobile-app-menu").isVisible())) throw new Error("Explore app menu failed to open");
      const firstMediaHeight = await page.locator(".explore-media-tile").first().evaluate((node) => node.getBoundingClientRect().height);
      await page.evaluate((distance) => window.scrollTo(0, distance), firstMediaHeight);
      await page.waitForTimeout(220);
      const afterMedia = await page.evaluate(() => ({ scrollY: scrollY, top: document.querySelector(".mobile-top-layer.is-flow .mobile-top-bar")?.getBoundingClientRect().bottom ?? null, dock: document.querySelector(".mobile-bottom-dock")?.getBoundingClientRect().top ?? null }));
      if (afterMedia.scrollY < firstMediaHeight - 2 || afterMedia.top === null || afterMedia.top > 0 || afterMedia.dock === null) throw new Error(`Explore flow top bar or floating dock behavior failed: ${JSON.stringify(afterMedia)}`);
      if (await page.locator("#mobile-app-menu").count()) throw new Error("Explore menu stayed open after its top-bar anchor left the viewport");
      await page.evaluate((distance) => window.scrollTo(0, distance + window.innerHeight * 0.45), firstMediaHeight);
      await page.waitForTimeout(100);
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-explore-scrolled-393.png"), animations: "disabled" });
      await page.waitForTimeout(80);
      await page.evaluate(() => window.scrollBy(0, -40));
      if (await topBar.evaluate((node) => node.getBoundingClientRect().bottom > 0)) throw new Error("Explore top bar reappeared after a small upward scroll below document top");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(80);
      if (await topBar.evaluate((node) => { const rect = node.getBoundingClientRect(); return rect.top < 0 || rect.bottom > innerHeight; })) throw new Error("Explore top bar did not return at document top");
      console.log(`Mobile Explore interactions passed ${JSON.stringify({ columns, filterScroll, afterMedia })}`);
    }
    if (process.argv.includes("--home-topbar") && target === "/" && width === 393) {
      const topBar = page.locator(".mobile-top-layer.is-home .mobile-top-bar");
      const dock = page.locator(".mobile-bottom-dock");
      const atTop = await page.evaluate(() => {
        const rect = document.querySelector(".mobile-top-layer.is-home .mobile-top-bar")?.getBoundingClientRect();
        return { scrollY: window.scrollY, top: rect?.top ?? null, bottom: rect?.bottom ?? null };
      });
      if (atTop.scrollY !== 0 || atTop.top === null || atTop.top < 0 || atTop.bottom > height) throw new Error(`Home top bar is not visible at the top of the document: ${JSON.stringify(atTop)}`);

      await page.getByRole("button", { name: "Open Flex Scenes menu" }).click();
      if (!(await page.locator("#mobile-app-menu").isVisible())) throw new Error("Home menu failed to open before scroll");
      const firstScroll = await page.evaluate(() => {
        const media = document.querySelector(".home-v2-mobile .home-v2-media");
        const distance = media?.getBoundingClientRect().height ?? 300;
        window.scrollTo(0, distance);
        return distance;
      });
      await page.waitForTimeout(250);
      const afterOneMedia = await page.evaluate(() => {
        const rect = document.querySelector(".mobile-top-layer.is-home .mobile-top-bar")?.getBoundingClientRect();
        const dock = document.querySelector(".mobile-bottom-dock")?.getBoundingClientRect();
        return { scrollY: window.scrollY, top: rect?.top ?? null, bottom: rect?.bottom ?? null, dockTop: dock?.top ?? null };
      });
      if (afterOneMedia.scrollY < firstScroll - 2 || afterOneMedia.bottom === null || afterOneMedia.bottom > 0) throw new Error(`Home top bar did not scroll completely out of view after one media height: ${JSON.stringify(afterOneMedia)}`);
      if (await page.locator("#mobile-app-menu").count()) throw new Error("Home menu remained open after its top-bar anchor scrolled away");
      if (!(await dock.isVisible())) throw new Error("Floating bottom dock disappeared after scrolling");
      await page.screenshot({ path: path.join(outputDir, "home-topbar-scrolled-393.png"), animations: "disabled" });

      await page.evaluate((distance) => window.scrollTo(0, distance + window.innerHeight * 0.6), firstScroll);
      await page.waitForTimeout(100);
      if (await topBar.evaluate((node) => node.getBoundingClientRect().bottom > 0)) throw new Error("Home top bar reappeared deeper in the feed");
      await page.evaluate(() => window.scrollBy(0, -48));
      await page.waitForTimeout(100);
      const afterSmallUp = await page.evaluate(() => ({ scrollY: window.scrollY, bottom: document.querySelector(".mobile-top-layer.is-home .mobile-top-bar")?.getBoundingClientRect().bottom ?? null }));
      if (afterSmallUp.scrollY <= 0 || afterSmallUp.bottom === null || afterSmallUp.bottom > 0) throw new Error(`Small upward scroll revealed the Home top bar below document top: ${JSON.stringify(afterSmallUp)}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(120);
      const returnedToTop = await page.evaluate(() => ({ scrollY: window.scrollY, visible: (() => { const rect = document.querySelector(".mobile-top-layer.is-home .mobile-top-bar")?.getBoundingClientRect(); return Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight); })() }));
      if (returnedToTop.scrollY !== 0 || !returnedToTop.visible || !(await dock.isVisible())) throw new Error(`Home top bar did not return at document top or dock did not persist: ${JSON.stringify(returnedToTop)}`);
      console.log(`Home top-bar scroll behavior passed ${JSON.stringify({ atTop, afterOneMedia, afterSmallUp, returnedToTop })}`);
    }
    if (process.argv.includes("--mobile-v3") && target === "/" && width === 393) {
      const actionCalls = [];
      await page.route("**/api/actions", async (route) => {
        try { actionCalls.push(JSON.parse(route.request().postData() ?? "{}")); } catch {}
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      });
      const menuButton = page.getByRole("button", { name: "Open Flex Scenes menu" });
      await menuButton.click();
      if (!(await page.locator("#mobile-app-menu").isVisible())) throw new Error("Mobile app menu did not open");
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-menu-393.png"), animations: "disabled" });
      await menuButton.click();
      if (await page.locator("#mobile-app-menu").count()) throw new Error("Tapping the menu title again did not close it");
      await menuButton.click();
      await page.keyboard.press("Escape");
      if (await page.locator("#mobile-app-menu").count()) throw new Error("Escape did not close the mobile app menu");
      if (!(await menuButton.evaluate((node) => document.activeElement === node))) throw new Error("Escape did not restore focus to the menu trigger");
      await menuButton.click();
      await page.mouse.click(3, 150);
      if (await page.locator("#mobile-app-menu").count()) throw new Error("Outside tap did not close the mobile app menu");

      const dock = page.getByRole("navigation", { name: "Main navigation" });
      for (const [label, pathname, dockVisible] of [["Explore", "/explore", true], ["Reels", "/reels", true], ["Library", "/library", true], ["Create a scene", "/create", false]]) {
        await dock.getByRole("button", { name: label }).click();
        await page.waitForTimeout(130);
        if (new URL(page.url()).pathname !== pathname) throw new Error(`Mobile dock ${label} action did not navigate to ${pathname}`);
        if ((await dock.isVisible()) !== dockVisible) throw new Error(`Mobile dock visibility was incorrect on ${pathname}`);
        if (!dockVisible) {
          await page.getByRole("button", { name: "Open Flex Scenes menu" }).click();
          await page.locator("#mobile-app-menu").getByRole("button", { name: "Home" }).click();
        }
      }
      await page.getByRole("button", { name: "Search characters and scenes" }).click();
      if (new URL(page.url()).pathname !== "/explore") throw new Error("Top-bar Search did not open Explore");
      await page.getByRole("button", { name: "Open Flex Scenes menu" }).click();
      await page.locator("#mobile-app-menu").getByRole("button", { name: "Home" }).click();
      await page.getByRole("button", { name: "Open Flex Scenes menu" }).click();
      await page.locator("#mobile-app-menu").getByRole("button", { name: "Switch" }).click();
      const characterChoices = page.locator(".mobile-menu-character-list button");
      if (await characterChoices.count() < 2) throw new Error("Active-character switcher did not list characters");
      const switchedCharacter = (await characterChoices.nth(1).innerText()).trim();
      await characterChoices.nth(1).click();
      if (await page.locator("#mobile-app-menu").count()) throw new Error("Selecting an active character did not close the menu");
      if (!(await page.getByRole("button", { name: `Open ${switchedCharacter}` }).count())) throw new Error("Top bar did not reflect the newly active character");
      await page.getByRole("button", { name: "Open Flex Scenes menu" }).click();
      await page.locator("#mobile-app-menu").getByRole("button", { name: "Home" }).click();
      await page.getByRole("button", { name: "Open Flex Scenes menu" }).click();
      await page.locator("#mobile-app-menu").getByRole("button", { name: "Messages" }).click();
      if (new URL(page.url()).pathname !== "/messages" || await dock.isVisible()) throw new Error("Messages inbox route chrome is incorrect");
      const firstConversation = page.locator(".studio-page-content aside button").nth(1);
      if (await firstConversation.count()) {
        await firstConversation.click();
        await page.waitForTimeout(100);
        if (!(await page.locator(".studio-shell").evaluate((node) => node.classList.contains("mobile-thread-active")))) throw new Error("Messages thread did not hide app chrome");
        await page.getByRole("button", { name: "Back to conversations" }).click();
        await page.waitForTimeout(100);
        if (await page.locator(".studio-shell").evaluate((node) => node.classList.contains("mobile-thread-active"))) throw new Error("Back from Messages thread did not restore inbox chrome");
      }
      await page.getByRole("button", { name: "Open Flex Scenes menu" }).click();
      await page.locator("#mobile-app-menu").getByRole("button", { name: "Home" }).click();
      await page.locator(".home-v2-mobile .home-v2-stories").evaluate((node) => { node.scrollLeft = node.scrollWidth; });
      const storyScroll = await page.locator(".home-v2-mobile .home-v2-stories").evaluate((node) => ({ left: node.scrollLeft, max: node.scrollWidth - node.clientWidth }));
      if (storyScroll.max <= 0 || storyScroll.left <= 0) throw new Error(`Mobile character rail did not scroll horizontally: ${JSON.stringify(storyScroll)}`);
      await page.locator(".home-v2-mobile .home-v2-story").nth(1).click();
      if (new URL(page.url()).pathname !== "/character") throw new Error("Tapping a story character did not open Character Hub");
      await page.getByRole("button", { name: "Open Flex Scenes menu" }).click();
      await page.locator("#mobile-app-menu").getByRole("button", { name: "Home" }).click();
      await page.locator(".home-v2-mobile .home-v2-post-actions .home-v2-like").first().click();
      await page.locator(".home-v2-mobile .home-v2-post-actions button[aria-label='Use as reference']").first().click();
      if (!actionCalls.some((item) => item.action === "favorite") || !actionCalls.some((item) => item.action === "reference")) throw new Error(`Favorite/reference actions did not reach their handlers: ${JSON.stringify(actionCalls)}`);
      await page.locator(".home-v2-mobile .home-v2-media").first().click();
      if (!(await page.locator(".media-detail-backdrop").isVisible())) throw new Error("Tapping Home media did not open Media Detail");
      await page.getByRole("button", { name: "Close media detail" }).click();
      await page.getByRole("button", { name: /Remix (image|video)/ }).first().click();
      if (new URL(page.url()).pathname !== "/create") throw new Error("Mobile Remix did not hand off to Create Studio");
      await page.getByRole("button", { name: "Open Flex Scenes menu" }).click();
      await page.locator("#mobile-app-menu").getByRole("button", { name: "Home" }).click();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(250);
      const scrolled = await page.evaluate(() => {
        const caption = document.querySelector(".home-v2-mobile .home-v2-post:last-child .home-v2-caption");
        const dockNode = document.querySelector(".mobile-bottom-dock");
        const topNode = document.querySelector(".mobile-top-bar");
        const viewportMeta = document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
        const captionBox = caption?.getBoundingClientRect();
        const dockBox = dockNode?.getBoundingClientRect();
        const topBox = topNode?.getBoundingClientRect();
        return { captionBottom: captionBox ? Math.round(captionBox.bottom) : null, dockTop: dockBox ? Math.round(dockBox.top) : null, topTop: topBox ? Math.round(topBox.top) : null, dock: dockBox ? { width: Math.round(dockBox.width), height: Math.round(dockBox.height), left: Math.round(dockBox.left), bottom: Math.round(innerHeight-dockBox.bottom) } : null, viewportFitCover: viewportMeta.includes("viewport-fit=cover") };
      });
      if (!scrolled.viewportFitCover || (scrolled.captionBottom !== null && scrolled.captionBottom > scrolled.dockTop)) throw new Error(`Mobile bottom dock/safe-area check failed: ${JSON.stringify(scrolled)}`);
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-scroll-393.png"), animations: "disabled" });
      console.log(`Mobile V3 interaction checks passed ${JSON.stringify({ storyScroll, switchedCharacter, scrolled, actionTypes: actionCalls.map((item) => item.action) })}`);
    }
    if (process.argv.includes("--smoke") && target === "/" && width === 393) {
      const action = page.getByRole("button", { name: /^(Remix image|Remix video)$/ }).first();
      if (await action.count() !== 1) throw new Error("Home has no working remix-to-create action");
      await action.click();
      await page.waitForTimeout(250);
      if (new URL(page.url()).pathname !== "/create") throw new Error(`Home media action did not open Create Studio (${page.url()})`);
      console.log("Home media to Create Studio handoff passed");
    }
    if (process.argv.includes("--smoke") && target === "/" && width >= 1280) {
      const messageAction = page.getByRole("button", { name: "Open Messages" });
      await messageAction.click();
      await page.waitForTimeout(150);
      if (new URL(page.url()).pathname !== "/messages") throw new Error("Desktop toolbar did not open Messages");
      await page.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });
      await page.locator(".home-v2-left-character-name").click();
      await page.waitForTimeout(150);
      if (new URL(page.url()).pathname !== "/character") throw new Error("Desktop active-character rail did not open Character Hub");
      console.log("Desktop toolbar and active-character navigation passed");
    }
    await page.close();
  }
  if (process.argv.includes("--routes")) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    for (const route of ["/", "/messages", "/create", "/character", "/library", "/reels", "/explore"]) {
      const response = await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "domcontentloaded" });
      if (!response || response.status() !== 200) throw new Error(`${route} returned HTTP ${response?.status() ?? "no response"}`);
      await page.waitForTimeout(180);
      console.log(`Route smoke passed: ${route} HTTP ${response.status()}`);
    }
    await page.close();
  }
} finally {
  await browser?.close();
  if (process.argv.includes("--keep-server")) {
    child.unref();
  } else if (child.pid) {
    try { child.kill("SIGTERM"); } catch {}
    child.unref();
  }
}
