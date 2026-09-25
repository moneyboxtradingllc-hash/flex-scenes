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
const reelsV3Captures = [
  { width: 390, height: 844, name: "mobile-v3-reels-390" },
  { width: 393, height: 852, name: "mobile-v3-reels-393" },
  { width: 430, height: 932, name: "mobile-v3-reels-430" },
];
const reelsPlaybackQACaptures = [{ width: 393, height: 852, name: "mobile-v3-reels-playing-393" }];
const reelsImmersiveCaptures = [
  { width: 390, height: 844, name: "mobile-v3-reels-immersive-390" },
  { width: 393, height: 852, name: "mobile-v3-reels-immersive-393" },
  { width: 430, height: 932, name: "mobile-v3-reels-immersive-430" },
];
const libraryV3Captures = [
  { width: 390, height: 844, name: "mobile-v3-library-390" },
  { width: 393, height: 852, name: "mobile-v3-library-393" },
  { width: 430, height: 932, name: "mobile-v3-library-430" },
];
const libraryPolishCaptures = [
  { width: 390, height: 844, name: "mobile-v3-library-polish-390" },
  { width: 393, height: 852, name: "mobile-v3-library-polish-393" },
  { width: 430, height: 932, name: "mobile-v3-library-polish-430" },
];
const messagesHubCaptures = [
  { width: 390, height: 844, name: "mobile-v3-messages-list-390" },
  { width: 393, height: 852, name: "mobile-v3-messages-list-393" },
  { width: 430, height: 932, name: "mobile-v3-messages-list-430" },
];
const captures = process.argv.includes("--home-v2")
  ? referenceCaptures
  : process.argv.includes("--desktop-v3")
    ? desktopV3Captures
  : process.argv.includes("--home-topbar")
    ? homeTopbarCapture
  : process.argv.includes("--explore-v3")
    ? exploreV3Captures
  : process.argv.includes("--reels-v3")
    ? reelsV3Captures
  : process.argv.includes("--reels-immersive")
    ? reelsImmersiveCaptures
  : process.argv.includes("--library-v3")
    ? libraryV3Captures
  : process.argv.includes("--library-polish")
    ? libraryPolishCaptures
  : process.argv.includes("--messages-hub-v3")
    ? messagesHubCaptures
  : process.argv.includes("--reels-playback-qa")
    ? reelsPlaybackQACaptures
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
  env: {
    ...process.env,
    FLEX_SCENES_QA_WORKTREE_ID: worktreeId,
    ...((process.argv.includes("--reels-playback-qa") || process.argv.includes("--reels-immersive") || process.argv.includes("--library-polish")) ? { FLEX_SCENES_LOCAL_QA: "1" } : {}),
    ...(process.argv.includes("--messages-hub-v3") ? { FLEX_SCENES_QA_DATA_DIR: path.join(root, ".artifacts", `messages-hub-qa-data-${worktreeId.slice(0, 12)}`) } : {}),
    ...(hostname === "0.0.0.0" ? { FLEX_SCENES_LAN_IP: urlHost } : {}),
  },
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
    let page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: width < 768 ? 2 : 1,
      isMobile: width < 768,
      hasTouch: width <= 768,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      const text = message.text();
      const location = message.location().url;
      const expectedBrokenQaRequest = process.argv.includes("--library-polish") && /__qa_missing_library_(?:image|video)__/.test(`${text} ${location}`);
      if (message.type() === "error" && !expectedBrokenQaRequest) errors.push(text);
    });
    if (process.argv.includes("--library-v3") && target === "/library" && width === 393) {
      const mutations = [];
      await page.route("**/api/actions", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        mutations.push(JSON.parse(route.request().postData() ?? "{}"));
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, qaOnly: true }) });
      });
      await page.route("**/api/media/upload", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        mutations.push({ action: "upload-qa-stub" });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, mediaId: "qa-only" }) });
      });
      page.__libraryMutations = mutations;
    }
    if ((process.argv.includes("--reels-playback-qa") || process.argv.includes("--reels-immersive")) && target === "/reels") {
      await page.route("**/api/qa/reel-playback-fixture.mp4**", async (route) => {
        if (route.request().headers().range === "bytes=0-31") return route.continue();
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return route.continue();
      });
    }
    const pageUrl = new URL(target, baseUrl);
    if (process.argv.includes("--library-polish") && target === "/library") pageUrl.searchParams.set("qaLibraryPolish", "1");
    if ((process.argv.includes("--reels-playback-qa") || process.argv.includes("--reels-immersive")) && target === "/reels") pageUrl.searchParams.set("qaPlayback", "1");
    await page.goto(pageUrl.toString(), { waitUntil: "domcontentloaded" });
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
    const brokenImages = await page.evaluate((allowBrokenQaFixture) => Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src)
      .filter((src) => !(allowBrokenQaFixture && src.includes("__qa_missing_library_image__"))), process.argv.includes("--library-polish"));
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
    if (process.argv.includes("--reels-immersive") && target === "/reels") {
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-reel-slide][data-active="true"] video');
        return video && video.readyState >= 2 && !video.paused && video.currentTime > 0.35 && !document.querySelector(".reels-mobile-loading");
      }, { timeout: 10000 });
    }
    await page.screenshot({ path: output, animations: "disabled" });
    console.log(`${output} ${JSON.stringify(metrics)}`);
    if (process.argv.includes("--messages-hub-v3") && target === "/messages") {
      const sizing = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, inputFont: getComputedStyle(document.querySelector(".messages-mobile-search input")).fontSize, dock: !!document.querySelector(".mobile-bottom-dock"), dockDisplay: getComputedStyle(document.querySelector(".mobile-bottom-dock") ?? document.body).display }));
      if (width < 768 && sizing.document > sizing.viewport + 1) throw new Error(`Messages list overflow at ${width}px: ${JSON.stringify(sizing)}`);
      if (width < 768 && sizing.inputFont !== "16px") throw new Error(`Messages search should stay at 16px: ${JSON.stringify(sizing)}`);
      if (width < 768 && (sizing.dock || await page.locator(".mobile-bottom-dock:visible").count())) throw new Error("Messages route unexpectedly displays the shared bottom dock");
      if (width === 393) {
        const directorRequests = [];
        await page.route("**/api/director", async (route) => {
          if (route.request().method() === "POST") directorRequests.push(JSON.parse(route.request().postData() ?? "{}"));
          await route.continue();
        });
        const firstConversation = page.locator(".messages-mobile-row").first();
        if (!(await firstConversation.count())) throw new Error("Seeded QA database has no conversations");
        await firstConversation.click();
        await page.waitForSelector(".messages-mobile-thread");
        const threadChrome = await page.evaluate(() => ({ topBar: document.querySelector(".mobile-top-bar") && getComputedStyle(document.querySelector(".mobile-top-bar")).display !== "none", dockPresent: !!document.querySelector(".mobile-bottom-dock"), composerFont: getComputedStyle(document.querySelector(".messages-mobile-composer textarea")).fontSize }));
        if (threadChrome.topBar || threadChrome.dockPresent || threadChrome.composerFont !== "16px") throw new Error(`Thread chrome or composer size is incorrect: ${JSON.stringify(threadChrome)}`);
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-message-thread-393.png"), animations: "disabled" });

        const plus = page.getByRole("button", { name: "More conversation actions" });
        await plus.click();
        await page.getByLabel("Attach media").selectOption({ index: 1 });
        if (!(await page.locator(".messages-mobile-attachment-chip").isVisible())) throw new Error("Composer media selection did not show the selected attachment");
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-message-composer-393.png"), animations: "disabled" });
        await plus.click();
        await page.getByLabel("Message", { exact: true }).fill("QA note: a blue lantern by the window.");
        await page.getByRole("button", { name: "Send message" }).click();
        await page.waitForFunction(() => [...document.querySelectorAll(".messages-mobile-message.user p")].some((node) => node.textContent.includes("blue lantern")), { timeout: 10000 });
        await page.waitForFunction(() => document.querySelector(".messages-mobile-streaming") === null, { timeout: 10000 });
        if (!directorRequests.some((entry) => entry.action === "message" && entry.mediaId)) throw new Error(`The existing Director message path did not submit text with the selected media: ${JSON.stringify(directorRequests)}`);
        await page.getByRole("button", { name: "More conversation actions" }).click();
        await page.getByRole("button", { name: "Ask for an idea" }).click();
        await page.waitForSelector(".messages-mobile-thread .message-proposal-actions-mobile", { timeout: 12000 });
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-message-thread-proposal-393.png"), animations: "disabled" });
        await page.locator(".mobile-message-identity").click();
        await page.waitForSelector(".conversation-details-mobile");
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-conversation-details-393.png"), animations: "disabled" });
        const detailsOverflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, broken: [...document.querySelectorAll(".conversation-details-mobile img")].filter((img) => img.complete && img.naturalWidth === 0).length }));
        if (detailsOverflow.document > detailsOverflow.viewport + 1 || detailsOverflow.broken) throw new Error(`Conversation details media integrity failed: ${JSON.stringify(detailsOverflow)}`);
        await page.locator(".conversation-details-mobile").evaluate((node) => { node.scrollTop = node.scrollHeight; });
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-conversation-shared-media-393.png"), animations: "disabled" });

        await page.getByRole("button", { name: "Search Chat" }).click();
        await page.getByRole("searchbox", { name: "Search this conversation" }).fill("blue lantern");
        await page.waitForSelector(".conversation-search-results button");
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-conversation-search-393.png"), animations: "disabled" });
        await page.locator(".conversation-search-results button").first().click();
        await page.waitForSelector(".messages-mobile-message.is-highlighted");
        await page.locator(".mobile-message-identity").click();
        await page.getByRole("button", { name: "Character Hub" }).click();
        await page.waitForSelector(".character-hub-mobile");
        const hubBadges = await page.locator(".character-hub-mobile [data-testid=library-media-thumbnail] video").count();
        const hubImages = await page.evaluate(() => [...document.querySelectorAll(".character-hub-mobile img")].filter((img) => img.complete && img.naturalWidth === 0).length);
        if (hubImages) throw new Error(`Character Hub has broken images: ${hubImages}`);
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-character-hub-393.png"), animations: "disabled" });
        const hubMediaGrid = await page.evaluate(() => { const grid = document.querySelector(".character-mobile-grid"); return { overflow: document.documentElement.scrollWidth > innerWidth, columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : null }; });
        if (hubMediaGrid.overflow || hubMediaGrid.columns !== 3) throw new Error(`Character Hub media grid contract failed: ${JSON.stringify(hubMediaGrid)}`);
        await page.getByRole("button", { name: "Videos", exact: true }).click();
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-character-hub-videos-393.png"), animations: "disabled" });
        await page.getByRole("button", { name: /References/ }).click();
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-character-hub-references-393.png"), animations: "disabled" });
        await page.getByRole("button", { name: "Collections", exact: true }).click();
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-character-hub-collections-393.png"), animations: "disabled" });
        const collectionCard = page.locator(".character-mobile-collections > button").first();
        if (await collectionCard.count()) {
          const collectionName = await collectionCard.locator("b").textContent();
          await collectionCard.click();
          await page.waitForSelector(".character-mobile-collection-detail");
          if (!(await page.locator(".character-mobile-collection-detail h2").textContent())?.includes(collectionName ?? "")) throw new Error("Character Hub collection did not open its matching assets");
          await page.locator(".character-mobile-collection-detail > button").click();
        }
        const hubGrid = await page.evaluate(() => { const grid=document.querySelector(".character-mobile-grid");return { overflow: document.documentElement.scrollWidth > innerWidth, highlights: document.querySelectorAll(".character-hub-mobile .character-mobile-highlight").length, columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : null, collectionCards: document.querySelectorAll(".character-mobile-collections>button").length }; });
        if (hubGrid.overflow || hubGrid.highlights || hubGrid.columns !== null && hubGrid.columns !== 3) throw new Error(`Character Hub mobile layout contract failed: ${JSON.stringify(hubGrid)}`);
        await page.locator(".character-mobile-top button").first().click();
        await page.waitForSelector(".conversation-details-mobile");
        await page.locator(".conversation-details-header button").first().click();
        await page.waitForSelector(".messages-mobile-thread");
        await page.getByRole("button", { name: "Back to messages" }).click();
        await page.waitForSelector(".messages-mobile-list");
        await page.locator(".messages-mobile-row").first().click();
        await page.waitForSelector(".messages-mobile-thread");
        await page.locator(".messages-mobile-thread").getByRole("button", { name: "Create This Scene" }).click();
        await page.waitForFunction(() => location.pathname === "/create", { timeout: 5000 });
        await page.close();
        page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        await page.goto(new URL("/character", baseUrl).toString(), { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".character-hub-mobile");
        await page.locator(".character-mobile-actions button[aria-label='Character settings']").click();
        await page.getByRole("heading", { name: "Character Settings" }).waitFor({ timeout: 5000 });
        await page.close();
        page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        await page.goto(new URL("/character", baseUrl).toString(), { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".character-hub-mobile");
        await page.locator(".character-mobile-actions").getByRole("button", { name: "Message" }).click();
        await page.waitForSelector(".messages-mobile-thread");
        console.log(`Messages/Character Hub mobile flow passed ${JSON.stringify({ width, sizing, threadChrome, detailsOverflow, hubBadges, hubMediaGrid, hubGrid, directorActions: directorRequests.map((entry) => entry.action) })}`);
      }
      if (width === 390 || width === 430) {
        await page.goto(new URL("/character", baseUrl).toString(), { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".character-hub-mobile");
        const hubOverflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, columns: getComputedStyle(document.querySelector(".character-mobile-grid")).gridTemplateColumns.split(" ").length }));
        if (hubOverflow.document > hubOverflow.viewport + 1 || hubOverflow.columns !== 3) throw new Error(`Character Hub viewport check failed: ${JSON.stringify(hubOverflow)}`);
        await page.screenshot({ path: path.join(outputDir, `mobile-v3-character-hub-${width}.png`), animations: "disabled" });
      }
    }
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
        const originalHeight = window.visualViewport?.height ?? window.innerHeight;
        const keyboardViewport = new EventTarget();
        let height = originalHeight;
        Object.defineProperty(keyboardViewport, "height", { get: () => height });
        window.__keyboardViewport = keyboardViewport;
        window.__setVisualViewportHeight = (nextHeight) => {
          height = nextHeight;
          keyboardViewport.dispatchEvent(new Event("resize"));
          keyboardViewport.dispatchEvent(new Event("scroll"));
          window.dispatchEvent(new Event("resize"));
        };
        window.__visualViewportBaseline = originalHeight;
        Object.defineProperty(window, "visualViewport", { configurable: true, value: keyboardViewport });
        return true;
      });
      if (keyboardMocked) {
        await page.evaluate(() => window.__setVisualViewportHeight(Math.max(200, window.__visualViewportBaseline - 330)));
        await page.waitForFunction(() => document.querySelector("[data-mobile-shell]")?.getAttribute("data-keyboard-open") === "true");
        if (await dock.isVisible()) throw new Error("Floating dock overlapped the search keyboard viewport");
        await checkNoOverflow("search keyboard open");

        // Safari can dismiss the keyboard without blurring the focused search.
        // The viewport may remain slightly reduced by browser chrome.
        await page.evaluate(() => {
          window.__setVisualViewportHeight(window.__visualViewportBaseline - 70);
        });
        await page.waitForFunction(() => document.querySelector("[data-mobile-shell]")?.getAttribute("data-keyboard-open") !== "true");
        if (!(await dock.isVisible())) throw new Error("Floating dock did not return after keyboard dismissal while search stayed focused");
        if (!(await search.evaluate((node) => document.activeElement === node))) throw new Error("Keyboard-dismiss simulation unexpectedly blurred the search field");

        await page.evaluate(() => window.scrollTo(0, Math.max(400, document.documentElement.scrollHeight / 3)));
        await page.waitForTimeout(50);
        if (!(await dock.isVisible())) throw new Error("Floating dock disappeared after scrolling with the keyboard closed");

        await page.evaluate(() => window.__setVisualViewportHeight(window.__visualViewportBaseline - 330));
        await page.waitForFunction(() => document.querySelector("[data-mobile-shell]")?.getAttribute("data-keyboard-open") === "true");
        if (await dock.isVisible()) throw new Error("Floating dock did not hide when the keyboard reopened");
        await page.evaluate(() => window.__setVisualViewportHeight(window.__visualViewportBaseline));
        await page.waitForFunction(() => document.querySelector("[data-mobile-shell]")?.getAttribute("data-keyboard-open") !== "true");
        if (!(await dock.isVisible())) throw new Error("Floating dock did not return after the second keyboard dismissal");

        // A Safari toolbar-only change is deliberately smaller than the
        // keyboard threshold and must leave the dock visible.
        await page.evaluate(() => window.__setVisualViewportHeight(window.__visualViewportBaseline - 90));
        await page.waitForTimeout(50);
        if (await page.locator("[data-mobile-shell]").getAttribute("data-keyboard-open") === "true" || !(await dock.isVisible())) throw new Error("Safari browser-chrome viewport change was misclassified as the keyboard");

        await page.evaluate(() => {
          const original = window.__visualViewportDescriptor;
          if (original) Object.defineProperty(window, "visualViewport", original);
          delete window.__visualViewportDescriptor;
          delete window.__keyboardViewport;
          delete window.__setVisualViewportHeight;
          delete window.__visualViewportBaseline;
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
    if (process.argv.includes("--reels-playback-qa") && target === "/reels" && width === 393) {
      const feed = page.locator("[data-reels-mobile-feed]");
      const activeSlide = page.locator('[data-reel-slide][data-active="true"]');
      const dock = page.getByRole("navigation", { name: "Main navigation" });
      const fixtureResponse = await page.evaluate(async () => {
        const response = await fetch("/api/qa/reel-playback-fixture.mp4", { headers: { Range: "bytes=0-31" } });
        return { status: response.status, type: response.headers.get("content-type"), range: response.headers.get("content-range"), bytes: (await response.arrayBuffer()).byteLength };
      });
      if (fixtureResponse.status !== 206 || fixtureResponse.type !== "video/mp4" || fixtureResponse.bytes !== 32 || !fixtureResponse.range?.startsWith("bytes 0-31/")) throw new Error(`Development fixture route did not support MP4 byte ranges: ${JSON.stringify(fixtureResponse)}`);
      if (!(await page.locator(".reels-mobile-qa-badge").first().isVisible())) throw new Error("Development playback fixture is not labeled Local QA");
      const initial = await page.evaluate(() => ({
        slideCount: document.querySelectorAll("[data-reel-slide]").length,
        mountedVideos: document.querySelectorAll("[data-reel-slide] video").length,
        viewport: { width: innerWidth, height: innerHeight },
        slide: document.querySelector('[data-reel-slide][data-active="true"]')?.getBoundingClientRect().toJSON(),
      }));
      if (initial.slideCount !== 2 || initial.mountedVideos !== 1 || initial.slide?.height !== height) throw new Error(`QA mode should provide two viewport-height Reels with one mounted video: ${JSON.stringify(initial)}`);
      const beforeMetadataBox = await activeSlide.evaluate((node) => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; });
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-reel-slide][data-active="true"] video');
        return video && video.readyState >= 2 && !video.paused;
      }, { timeout: 10000 });
      const firstVideo = page.locator('[data-reel-slide][data-active="true"] video');
      const firstMetrics = await firstVideo.evaluate((video) => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, muted: video.muted, paused: video.paused, readyState: video.readyState }));
      if (Math.abs(firstMetrics.duration - 5) > 0.05 || firstMetrics.width !== 360 || firstMetrics.height !== 640 || !firstMetrics.muted || firstMetrics.paused) throw new Error(`First QA Reel did not autoplay as a silent 5-second portrait clip: ${JSON.stringify(firstMetrics)}`);
      await firstVideo.evaluate((video) => { window.__qaFirstVideo = video; });
      await page.waitForFunction(() => document.querySelector('[data-reel-slide][data-active="true"] video')?.readyState >= 1);
      const afterMetadataBox = await activeSlide.evaluate((node) => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; });
      if (JSON.stringify(beforeMetadataBox) !== JSON.stringify(afterMetadataBox)) throw new Error(`Video metadata caused a Reel layout shift: ${JSON.stringify({ beforeMetadataBox, afterMetadataBox })}`);
      const firstOverlay = await page.evaluate(() => ({
        sharedDockVisible: [...document.querySelectorAll(".mobile-bottom-dock,nav.app-bottom-nav")].some((node) => getComputedStyle(node).display !== "none" && node.getClientRects().length > 0),
        railBottom: document.querySelector('[data-reel-slide][data-active="true"] .reels-mobile-rail')?.getBoundingClientRect().bottom ?? null,
        messageTop: document.querySelector('[data-reel-slide][data-active="true"] .reels-mobile-message-strip')?.getBoundingClientRect().top ?? null,
        allVideos: document.querySelectorAll("[data-reel-slide] video").length,
      }));
      if (firstOverlay.sharedDockVisible || firstOverlay.railBottom === null || firstOverlay.messageTop === null || firstOverlay.railBottom > firstOverlay.messageTop || firstOverlay.allVideos !== 1) throw new Error(`The immersive action rail overlaps the interaction strip, shared dock remains visible, or multiple videos are mounted: ${JSON.stringify(firstOverlay)}`);
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-playing-393.png"), animations: "disabled" });

      await page.mouse.move(192, 690);
      await page.mouse.wheel(0, 740);
      await page.waitForFunction(() => document.querySelector('[data-reel-slide][data-active="true"]')?.getAttribute("data-reel-index") === "1", { timeout: 5000 });
      await page.waitForFunction(() => {
        const feed = document.querySelector("[data-reels-mobile-feed]");
        const slide = document.querySelector('[data-reel-slide][data-active="true"]');
        return feed && slide && Math.abs(feed.scrollTop - slide.offsetTop) <= 3 && Math.abs(slide.getBoundingClientRect().top) <= 3;
      }, { timeout: 5000 });
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-reel-slide][data-active="true"] video');
        return video && video.readyState >= 2 && !video.paused;
      }, { timeout: 10000 });
      const secondMetrics = await page.evaluate(() => ({
        active: document.querySelector('[data-reel-slide][data-active="true"]')?.getAttribute("data-reel-index"),
        videoCount: document.querySelectorAll("[data-reel-slide] video").length,
        paused: document.querySelector('[data-reel-slide][data-active="true"] video')?.paused,
        scrollTop: Math.round(document.querySelector("[data-reels-mobile-feed]").scrollTop),
        snapTarget: Math.round(document.querySelector('[data-reel-slide][data-active="true"]').offsetTop),
        slideTop: Math.round(document.querySelector('[data-reel-slide][data-active="true"]').getBoundingClientRect().top),
        previousPaused: window.__qaFirstVideo?.paused,
      }));
      if (secondMetrics.active !== "1" || secondMetrics.videoCount !== 1 || secondMetrics.paused || !secondMetrics.previousPaused || Math.abs(secondMetrics.scrollTop - secondMetrics.snapTarget) > 3 || Math.abs(secondMetrics.slideTop) > 3) throw new Error(`Second Reel did not snap to its viewport start and play exclusively, or Reel 1 failed to pause: ${JSON.stringify(secondMetrics)}`);
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-second-playing-393.png"), animations: "disabled" });
      await page.locator('[data-reel-slide][data-active="true"] video').evaluate((video) => { window.__qaSecondVideo = video; });

      await page.mouse.wheel(0, -740);
      await page.waitForFunction(() => document.querySelector('[data-reel-slide][data-active="true"]')?.getAttribute("data-reel-index") === "0", { timeout: 5000 });
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-reel-slide][data-active="true"] video');
        return video && video.readyState >= 2 && !video.paused;
      }, { timeout: 10000 });
      const resumed = await page.evaluate(() => ({ videoCount: document.querySelectorAll("[data-reel-slide] video").length, playing: !document.querySelector('[data-reel-slide][data-active="true"] video')?.paused, previousPaused: window.__qaSecondVideo?.paused }));
      if (resumed.videoCount !== 1 || !resumed.playing || !resumed.previousPaused) throw new Error(`Reel 1 did not resume exclusively after Reel 2 paused: ${JSON.stringify(resumed)}`);

      const currentVideo = page.locator('[data-reel-slide][data-active="true"] video');
      await currentVideo.click({ position: { x: 180, y: 350 } });
      await page.waitForFunction(() => document.querySelector('[data-reel-slide][data-active="true"] video')?.paused === true);
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-paused-realvideo-393.png"), animations: "disabled" });
      await page.getByRole("button", { name: "Play reel" }).click();
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-reel-slide][data-active="true"] video');
        return video && !video.paused;
      });

      const seek = page.getByRole("slider", { name: "Seek video" });
      await seek.evaluate((input) => { input.value = "0.55"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-reel-slide][data-active="true"] video');
        return video && video.currentTime / video.duration > 0.5 && video.currentTime / video.duration < 0.7;
      }, { timeout: 3000 });
      const seekPosition = await currentVideo.evaluate((video) => video.currentTime / video.duration);

      await currentVideo.evaluate((video) => { video.currentTime = video.duration - 0.06; });
      await page.waitForFunction(() => !!document.querySelector('[data-reel-slide][data-active="true"] button[aria-label="Replay reel"]'), { timeout: 3000 });
      const ended = await currentVideo.evaluate((video) => ({ ended: video.ended, paused: video.paused, currentTime: video.currentTime, duration: video.duration }));
      if (!ended.ended || !ended.paused) throw new Error(`QA Reel did not reach its ended state: ${JSON.stringify(ended)}`);
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-ended-393.png"), animations: "disabled" });
      await page.getByRole("button", { name: "Replay reel" }).click();
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-reel-slide][data-active="true"] video');
        return video && !video.paused && video.currentTime < 0.4;
      });

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-reel-slide][data-active="true"] video');
        return video && video.readyState >= 2 && !video.paused && video.currentTime > 0.25;
      }, { timeout: 10000 });
      await page.evaluate(() => { window.__qaNaturalFirstVideo = document.querySelector('[data-reel-slide][data-active="true"] video'); });
      const manualPauseVideo = page.locator('[data-reel-slide][data-active="true"] video');
      await manualPauseVideo.click({ position: { x: 180, y: 350 } });
      await page.waitForFunction(() => document.querySelector('[data-reel-slide][data-active="true"] video')?.paused === true);
      await page.waitForTimeout(900);
      const manualPause = await page.evaluate(() => ({ active: document.querySelector('[data-reel-slide][data-active="true"]')?.getAttribute("data-reel-index"), paused: document.querySelector('[data-reel-slide][data-active="true"] video')?.paused }));
      if (manualPause.active !== "0" || !manualPause.paused) throw new Error(`Manual pause incorrectly advanced the Reel: ${JSON.stringify(manualPause)}`);
      await page.getByRole("button", { name: "Play reel" }).click();
      await page.waitForFunction(() => document.querySelector('[data-reel-slide][data-active="true"] video')?.paused === false);

      await page.waitForFunction(() => document.querySelector('[data-reel-slide][data-active="true"]')?.getAttribute("data-reel-index") === "1", { timeout: 10000 });
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-reel-slide][data-active="true"] video');
        const slides = document.querySelectorAll("[data-reel-slide]");
        return video && video.readyState >= 2 && !video.paused && video.muted && slides.length === 2 && document.querySelectorAll("[data-reel-slide] video").length === 1;
      }, { timeout: 10000 });
      const autoAdvanced = await page.evaluate(() => ({
        active: document.querySelector('[data-reel-slide][data-active="true"]')?.getAttribute("data-reel-index"),
        videoCount: document.querySelectorAll("[data-reel-slide] video").length,
        playing: !document.querySelector('[data-reel-slide][data-active="true"] video')?.paused,
        muted: document.querySelector('[data-reel-slide][data-active="true"] video')?.muted,
        firstVideoPaused: window.__qaNaturalFirstVideo?.paused,
      }));
      if (autoAdvanced.active !== "1" || autoAdvanced.videoCount !== 1 || !autoAdvanced.playing || !autoAdvanced.muted || !autoAdvanced.firstVideoPaused) throw new Error(`Natural completion did not auto-advance to the sole muted active video: ${JSON.stringify(autoAdvanced)}`);
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-auto-advanced-393.png"), animations: "disabled" });
      await page.waitForFunction(() => !!document.querySelector('[data-reel-slide][data-active="true"] button[aria-label="Replay reel"]'), { timeout: 10000 });
      const finalReel = await page.evaluate(() => ({
        active: document.querySelector('[data-reel-slide][data-active="true"]')?.getAttribute("data-reel-index"),
        videoCount: document.querySelectorAll("[data-reel-slide] video").length,
        ended: document.querySelector('[data-reel-slide][data-active="true"] video')?.ended,
        paused: document.querySelector('[data-reel-slide][data-active="true"] video')?.paused,
        replayVisible: !!document.querySelector('[data-reel-slide][data-active="true"] button[aria-label="Replay reel"]'),
      }));
      if (finalReel.active !== "1" || finalReel.videoCount !== 1 || !finalReel.ended || !finalReel.paused || !finalReel.replayVisible) throw new Error(`Final Reel wrapped or lost its replay state: ${JSON.stringify(finalReel)}`);
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-auto-advance-final-393.png"), animations: "disabled" });
      await page.getByRole("button", { name: "Replay reel" }).click();
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-reel-slide][data-active="true"] video');
        return video && !video.paused && video.currentTime < 0.4;
      });
      console.log(`Real local video playback and natural auto-advance passed ${JSON.stringify({ fixture: firstMetrics, second: secondMetrics, resumed, seekPosition, ended, manualPause, autoAdvanced, finalReel, range: fixtureResponse, overlay: firstOverlay })}`);
    }

    if (process.argv.includes("--library-v3") && target === "/library" && width === 393) {
      const dock = page.getByRole("navigation", { name: "Main navigation" });
      const topBar = page.locator(".mobile-top-layer.is-flow .mobile-top-bar");
      const filters = page.getByRole("group", { name: "Library filters" });
      const search = page.getByRole("searchbox", { name: "Search media, characters, collections, and notes" });
      const checkOverflow = async (stage) => {
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        if (dimensions.document > dimensions.viewport + 1 || dimensions.body > dimensions.viewport + 1) throw new Error(`Library horizontal overflow at ${stage}: ${JSON.stringify(dimensions)}`);
        return dimensions;
      };
      const initial = await page.evaluate(() => ({
        columns: getComputedStyle(document.querySelector(".library-grid")).gridTemplateColumns.split(" ").length,
        topPosition: getComputedStyle(document.querySelector(".mobile-top-layer")).position,
        viewport: innerWidth,
        mediaCount: document.querySelectorAll(".library-tile").length,
        collectionCount: document.querySelectorAll(".library-collection-card").length,
        dockActive: document.querySelector('.mobile-bottom-dock [aria-label="Library"]')?.getAttribute("aria-current"),
      }));
      if (initial.columns !== 3 || initial.topPosition === "fixed" || initial.topPosition === "sticky" || initial.dockActive !== "page" || !await search.isVisible()) throw new Error(`Mobile Library shell/grid failed its initial contract: ${JSON.stringify(initial)}`);
      await checkOverflow("All view");

      const chip = (name) => filters.getByRole("button", { name, exact: false });
      await chip("Images").click();
      await page.waitForTimeout(80);
      if (await page.locator(".library-tile").evaluateAll((nodes) => nodes.some((node) => node.querySelector("img")?.getAttribute("alt") === ""))) throw new Error("Images filter contains a tile without accessible media text");
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-images-393.png"), animations: "disabled" });
      await chip("Videos").click();
      await page.waitForTimeout(80);
      if (await page.locator(".library-tile").evaluateAll((nodes) => nodes.some((node) => !node.querySelector(".library-video-mark")))) throw new Error("Videos filter contains a tile without a video marker");
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-videos-393.png"), animations: "disabled" });
      await chip("Favorites").click();
      await chip("References").click();
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-references-393.png"), animations: "disabled" });
      await chip("All").click();

      await search.fill("Mia");
      await page.waitForTimeout(180);
      if (!(await page.getByRole("button", { name: "Clear search" }).isVisible())) throw new Error("Library search did not expose its clear action");
      await page.getByRole("button", { name: "Clear search" }).click();
      await checkOverflow("search clear");

      const characterStrip = page.getByRole("group", { name: "Filter by character" });
      const characterButtons = characterStrip.locator("button[aria-pressed]");
      if (await characterButtons.count() > 1) {
        await characterButtons.nth(1).click();
        if (await characterButtons.nth(1).getAttribute("aria-pressed") !== "true") throw new Error("Library character filter did not become active");
        await characterStrip.getByRole("button", { name: "All Characters" }).click();
      }

      await page.locator(".library-mobile-controls").getByRole("button", { name: "Open Library filters" }).click();
      const filterSheet = page.getByRole("dialog", { name: "Filter & sort" });
      if (!(await filterSheet.isVisible())) throw new Error("Library filter and sort sheet did not open");
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-filters-393.png"), animations: "disabled" });
      for (const value of ["Oldest", "Character", "Newest"]) await filterSheet.getByLabel("Sort media").selectOption(value);
      for (const value of ["Generated", "Imported", "Recent", "Any source"]) await filterSheet.getByLabel("Filter by source").selectOption(value);
      await filterSheet.getByRole("button", { name: "Done" }).click();

      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(80);
      if (await topBar.evaluate((node) => node.getBoundingClientRect().bottom > 0)) throw new Error("Library top bar remained visible after scrolling down");
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-scrolled-393.png"), animations: "disabled" });
      await page.evaluate(() => window.scrollTo(0, 820));
      await page.waitForTimeout(80);
      if (await topBar.evaluate((node) => node.getBoundingClientRect().bottom > 0)) throw new Error("Library top bar reappeared after a small upward scroll mid-page");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      if (await topBar.evaluate((node) => { const rect = node.getBoundingClientRect(); return rect.top < 0 || rect.bottom > innerHeight; })) throw new Error("Library top bar did not return at absolute document top");

      await chip("Collections").click();
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-collections-393.png"), animations: "disabled" });
      const collectionCard = page.locator(".library-collection-card").first();
      if (await collectionCard.count()) {
        await collectionCard.click();
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-collection-open-393.png"), animations: "disabled" });
        const removeItem = page.locator(".library-remove-item").first();
        if (await removeItem.count()) {
          await removeItem.click();
          await page.waitForTimeout(80);
          if (!page.__libraryMutations.some((entry) => entry.action === "collection-remove")) throw new Error("Collection item Remove action did not reach the mocked action boundary");
        }
        await page.getByRole("button", { name: "Rename", exact: true }).click();
        const renameDialog = page.getByRole("dialog", { name: "Rename collection" });
        if (!(await renameDialog.isVisible())) throw new Error("Collection rename sheet did not open");
        await renameDialog.getByPlaceholder("Collection name").fill("QA rename intercepted");
        await renameDialog.getByRole("button", { name: "Save" }).click();
        await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-labelledby="library-collection-dialog-title"]'));
        if (!page.__libraryMutations.some((entry) => entry.action === "collection-rename")) throw new Error("Collection rename did not reach the mocked action boundary");
        await page.locator(".library-back").click();
      } else {
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-collection-open-393.png"), animations: "disabled" });
      }
      await page.getByRole("button", { name: "New collection", exact: false }).click();
      const createDialog = page.getByRole("dialog", { name: "New collection" });
      await createDialog.getByPlaceholder("Collection name").fill("QA Collection intercepted");
      await createDialog.getByRole("button", { name: "Create", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-labelledby="library-collection-dialog-title"]'));
      if (!page.__libraryMutations.some((entry) => entry.action === "collection-create")) throw new Error("Collection create did not reach the mocked action boundary");

      await chip("All").click();
      await page.locator(".library-mobile-controls").getByRole("button", { name: "Select", exact: true }).click();
      const tile = page.locator(".library-tile").first();
      if (await tile.count()) {
        await tile.evaluate((node) => node.click());
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-select-393.png"), animations: "disabled" });
        const tray = page.locator(".library-bulk-bar");
        if (!(await tray.isVisible()) || !(await tray.getByText("1 selected").isVisible())) throw new Error("Bulk selection did not show its selected count tray");
        const trayGeometry = await tray.evaluate((node) => ({ ...node.getBoundingClientRect().toJSON(), dockTop: document.querySelector(".mobile-bottom-dock").getBoundingClientRect().top }));
        if (trayGeometry.height > 170 || trayGeometry.bottom > trayGeometry.dockTop + 1) throw new Error(`Bulk action tray is oversized or obscures the floating dock: ${JSON.stringify(trayGeometry)}`);
        await tray.getByRole("button", { name: "Favorite", exact: true }).click();
        if (!page.__libraryMutations.some((entry) => entry.action === "favorite")) throw new Error("Bulk Favorite action did not reach the mocked action boundary");
        await page.waitForFunction(() => !document.querySelector(".library-bulk-bar"));
        const favoriteTile = page.locator(".library-tile:has(.library-favorite-mark)").first();
        if (await favoriteTile.count()) {
          await page.locator(".library-mobile-controls").getByRole("button", { name: "Select", exact: true }).click();
          await favoriteTile.evaluate((node) => node.click());
          await page.locator(".library-bulk-bar").getByRole("button", { name: "Remove Favorite", exact: true }).click();
          if (!page.__libraryMutations.some((entry) => entry.action === "favorite")) throw new Error("Bulk Remove Favorite did not reach the mocked action boundary");
          await page.waitForFunction(() => !document.querySelector(".library-bulk-bar"));
        }
        await page.locator(".library-mobile-controls").getByRole("button", { name: "Select", exact: true }).click();
        await page.locator(".library-tile").first().evaluate((node) => node.click());
        await page.locator(".library-bulk-bar").getByRole("button", { name: "Add as Reference" }).click();
        if (!page.__libraryMutations.some((entry) => entry.action === "reference")) throw new Error("Bulk Reference action did not reach the mocked action boundary");
        await page.waitForFunction(() => !document.querySelector(".library-bulk-bar"));
        await page.locator(".library-mobile-controls").getByRole("button", { name: "Select", exact: true }).click();
        await page.locator(".library-tile").first().evaluate((node) => node.click());
        const collectionPicker = page.getByLabel("Add selected to collection");
        if (await collectionPicker.locator("option").count() > 1) {
          await collectionPicker.selectOption({ index: 1 });
          if (!page.__libraryMutations.some((entry) => entry.action === "collection-add")) throw new Error("Bulk Add to Collection did not reach the mocked action boundary");
          await page.waitForFunction(() => !document.querySelector(".library-bulk-bar"));
        }
      } else {
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-select-393.png"), animations: "disabled" });
      }

      await page.getByRole("button", { name: /Import media/ }).click();
      const importDialog = page.getByRole("dialog", { name: "Import image or video" });
      if (!(await importDialog.isVisible())) throw new Error("Library import sheet did not open");
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-import-393.png"), animations: "disabled" });
      if (await importDialog.locator("select").count()) await importDialog.locator("select").selectOption({ index: 0 });
      await importDialog.locator('input[type="file"]').setInputFiles({ name: "qa-local.png", mimeType: "image/png", buffer: Buffer.from("qa-only") });
      await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-labelledby="library-import-title"]'));
      if (!page.__libraryMutations.some((entry) => entry.action === "upload-qa-stub")) throw new Error("Local import flow did not use the mocked upload boundary");

      const detailTile = page.locator(".library-tile").first();
      await detailTile.evaluate((node) => node.click());
      const libraryReturnState = await page.evaluate(() => ({ scrollY: window.scrollY, activeFilter: document.querySelector(".library-filter-row button.active")?.textContent?.trim() }));
      if (!(await page.locator(".media-detail-backdrop").isVisible())) throw new Error("Library tile did not open existing Media Detail");
      await page.getByRole("button", { name: "Close media detail" }).click();
      if (await page.locator(".media-detail-backdrop").count()) throw new Error("Closing Media Detail did not restore the Library view");
      const restoredLibraryState = await page.evaluate(() => ({ scrollY: window.scrollY, activeFilter: document.querySelector(".library-filter-row button.active")?.textContent?.trim() }));
      if (restoredLibraryState.activeFilter !== libraryReturnState.activeFilter || restoredLibraryState.scrollY !== libraryReturnState.scrollY) throw new Error(`Media Detail did not return to the same Library filter and scroll position: ${JSON.stringify({ libraryReturnState, restoredLibraryState })}`);

      await page.getByRole("button", { name: "Create Scene", exact: true }).click();
      if (new URL(page.url()).pathname !== "/create") throw new Error("Library Create Scene action did not hand off to Create Studio");
      for (const route of ["/", "/explore", "/reels", "/library", "/messages", "/create", "/character"]) {
        const response = await page.request.get(new URL(route, baseUrl).toString());
        if (response.status() !== 200) throw new Error(`Library route smoke failed for ${route}: ${response.status()}`);
      }
      await checkOverflow("final interaction sequence");
      console.log(`Mobile Library QA passed ${JSON.stringify({ ...initial, mutationsMocked: page.__libraryMutations.length, routes: 7, topBar: "flow-only, returns at absolute top", detailReturn: true })}`);
    }

    if (process.argv.includes("--library-polish") && target === "/library") {
      const expectNoPageOverflow = async (stage) => {
        const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        if (size.document > size.viewport + 1 || size.body > size.viewport + 1) throw new Error(`Library polish horizontal overflow at ${width}px (${stage}): ${JSON.stringify(size)}`);
        return size;
      };
      const layout = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
        const actions = [...document.querySelectorAll(".library-header-actions button")].map((node) => ({
          text: node.innerText.trim(),
          label: node.getAttribute("aria-label"),
          height: Math.round(node.getBoundingClientRect().height),
          right: Math.round(node.getBoundingClientRect().right),
          clipped: [...node.querySelectorAll(".library-mobile-action-label")].some((label) => label.scrollWidth > label.clientWidth + 1),
        }));
        const strip = document.querySelector(".library-characters");
        return {
          columns: getComputedStyle(document.querySelector(".library-grid")).gridTemplateColumns.split(" ").length,
          actions,
          strip: strip ? { clientWidth: strip.clientWidth, scrollWidth: strip.scrollWidth, right: Math.round(strip.getBoundingClientRect().right) } : null,
          inputFontSize: getComputedStyle(document.querySelector(".library-search input")).fontSize,
          dock: rect(".mobile-bottom-dock")?.toJSON() ?? null,
        };
      });
      if (width < 768 && layout.columns !== 3) throw new Error(`Mobile Library must retain three columns: ${JSON.stringify(layout)}`);
      if (layout.inputFontSize !== "16px") throw new Error(`Mobile Library search font should stay 16px: ${layout.inputFontSize}`);
      if (layout.actions.some((action) => action.height < 44 || action.right > width)) throw new Error(`Library Import/Create controls do not fit or meet touch size: ${JSON.stringify(layout.actions)}`);
      if (width < 768 && (layout.actions[0]?.text !== "Import" || layout.actions[1]?.text !== "Create" || layout.actions.some((action) => action.clipped))) throw new Error(`Mobile Library action labels are not compact and fully visible: ${JSON.stringify(layout.actions)}`);
      if (!layout.strip || layout.strip.right > width || layout.strip.scrollWidth <= layout.strip.clientWidth) throw new Error(`Character strip should scroll within the viewport: ${JSON.stringify(layout.strip)}`);
      await expectNoPageOverflow("initial view");

      if (width === 393) {
        const waitForFailureFallbacks = async () => page.waitForFunction(() => {
          const missingImage = document.querySelector('[data-media-kind="image"][aria-label="QA bad image URL"]');
          const missingVideo = document.querySelector('[data-media-kind="video"][aria-label="QA missing video file"]');
          const previewVideo = document.querySelector('[data-media-kind="video"][aria-label="QA video without poster"]');
          return missingImage?.getAttribute("data-thumbnail-state") === "unavailable" &&
            missingVideo?.getAttribute("data-thumbnail-state") === "unavailable" &&
            previewVideo?.getAttribute("data-thumbnail-state") === "video-frame";
        }, { timeout: 12000 }).catch(async (error) => {
          const states = await page.evaluate(() => [...document.querySelectorAll('[data-testid="library-media-thumbnail"]')].map((node) => ({ label: node.getAttribute("aria-label"), kind: node.getAttribute("data-media-kind"), state: node.getAttribute("data-thumbnail-state"), video: node.querySelector("video") ? { readyState: node.querySelector("video").readyState, error: node.querySelector("video").error?.code } : null })));
          throw new Error(`${error.message}; thumbnail states: ${JSON.stringify(states)}`);
        });
        const waitForVideoFallbacks = async () => page.waitForFunction(() =>
          document.querySelector('[data-media-kind="video"][aria-label="QA missing video file"]')?.getAttribute("data-thumbnail-state") === "unavailable" &&
          document.querySelector('[data-media-kind="video"][aria-label="QA video without poster"]')?.getAttribute("data-thumbnail-state") === "video-frame",
        { timeout: 12000 });
        await waitForFailureFallbacks();

        const failureProof = await page.evaluate(() => {
          const roots = [...document.querySelectorAll(".library-tile [data-testid=library-media-thumbnail]")];
          const tileFor = (name) => roots.find((node) => node.getAttribute("aria-label") === name);
          const video = tileFor("QA video without poster")?.querySelector("video");
          const badImage = tileFor("QA bad image URL");
          const badVideo = tileFor("QA missing video file");
          const brokenImages = [...document.querySelectorAll(".library-vault img")].filter((image) => image.complete && image.naturalWidth === 0).length;
          return {
            noPosterVideo: { state: tileFor("QA video without poster")?.getAttribute("data-thumbnail-state"), muted: video?.muted, paused: video?.paused, tag: video?.tagName },
            badImage: { state: badImage?.getAttribute("data-thumbnail-state"), placeholder: !!badImage?.querySelector("[data-testid=library-thumbnail-fallback]"), imageElements: badImage?.querySelectorAll("img").length },
            missingVideo: { state: badVideo?.getAttribute("data-thumbnail-state"), placeholder: !!badVideo?.querySelector("[data-testid=library-thumbnail-fallback]") },
            brokenImages,
            badImageGeometry: badImage?.getBoundingClientRect().toJSON(),
          };
        });
        if (failureProof.noPosterVideo.tag !== "VIDEO" || failureProof.noPosterVideo.muted !== true || failureProof.noPosterVideo.paused !== true || failureProof.noPosterVideo.state !== "video-frame") throw new Error(`Posterless video did not render as a safe paused preview: ${JSON.stringify(failureProof.noPosterVideo)}`);
        if (failureProof.badImage.state !== "unavailable" || !failureProof.badImage.placeholder || failureProof.badImage.imageElements !== 0 || !failureProof.missingVideo.placeholder || failureProof.brokenImages !== 0) throw new Error(`Library media error fallback failed: ${JSON.stringify(failureProof)}`);
        if (Math.abs(failureProof.badImageGeometry.width - failureProof.badImageGeometry.height) > 1) throw new Error(`Broken media fallback changed square tile geometry: ${JSON.stringify(failureProof.badImageGeometry)}`);

        await page.locator(".library-filter-row button").filter({ hasText: "Videos" }).click();
        await waitForVideoFallbacks();
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-polish-videos-393.png"), animations: "disabled" });
        await page.locator(".library-filter-row button").filter({ hasText: "Collections" }).click();
        await waitForFailureFallbacks();
        const coverProof = await page.evaluate(() => {
          const cover = [...document.querySelectorAll(".library-collection-cover")].find((node) => node.querySelector('[aria-label="QA video without poster"]'));
          const preview = cover?.querySelector('[aria-label="QA video without poster"]');
          const missing = cover?.querySelector('[aria-label="QA missing video file"]');
          const badImage = cover?.querySelector('[aria-label="QA bad image URL"]');
          return { cover: !!cover, layout: cover?.className, preview: preview?.getAttribute("data-thumbnail-state"), videoCount: preview?.querySelectorAll("video").length, missing: missing?.getAttribute("data-thumbnail-state"), badImage: badImage?.getAttribute("data-thumbnail-state"), width: cover?.getBoundingClientRect().width };
        });
        if (!coverProof.cover || coverProof.preview !== "video-frame" || coverProof.videoCount !== 1 || coverProof.missing !== "unavailable" || coverProof.badImage !== "unavailable") throw new Error(`Collection cover did not use safe video/image thumbnail fallbacks: ${JSON.stringify(coverProof)}`);
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-polish-collections-393.png"), animations: "disabled" });

        await page.locator(".library-filter-row button").filter({ hasText: "All" }).click();
        const characterButtons = page.locator(".library-characters > button[aria-pressed]");
        if (await characterButtons.count() > 1) await characterButtons.nth(1).click();
        const stripProof = await page.evaluate(() => ({
          clearControlDisplay: getComputedStyle(document.querySelector(".library-clear-character") ?? document.body).display,
          allCharactersPressed: document.querySelector(".library-all-characters")?.getAttribute("aria-pressed"),
          names: [...document.querySelectorAll(".library-characters>button>span")].map((node) => ({ text: node.textContent.trim(), right: node.getBoundingClientRect().right, parentRight: node.parentElement.getBoundingClientRect().right })),
        }));
        if (stripProof.clearControlDisplay !== "none" || stripProof.allCharactersPressed !== "false" || stripProof.names.some((item) => item.right > item.parentRight + 1)) throw new Error(`Character chips leaked or an extra Clear Character control is visible: ${JSON.stringify(stripProof)}`);
        await page.locator(".library-all-characters").click();
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-polish-character-strip-393.png"), animations: "disabled" });

        await page.locator(".library-mobile-controls .library-multi-toggle").click();
        await page.locator(".library-tile").first().evaluate((node) => node.click());
        const tray = page.locator(".library-bulk-bar");
        const trayGeometry = await tray.evaluate((node) => ({ ...node.getBoundingClientRect().toJSON(), dockTop: document.querySelector(".mobile-bottom-dock").getBoundingClientRect().top, labels: [...node.querySelectorAll("button")].map((button) => button.getAttribute("aria-label")) }));
        if (!await tray.isVisible() || trayGeometry.height > 80 || trayGeometry.bottom > trayGeometry.dockTop + 1 || !["Favorite", "Remove Favorite", "Add as Reference"].every((name) => trayGeometry.labels.includes(name))) throw new Error(`Compact bulk tray layout/action contract failed: ${JSON.stringify(trayGeometry)}`);
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-library-polish-select-393.png"), animations: "disabled" });
        await expectNoPageOverflow("bulk selection");
        console.log(`Mobile Library polish QA passed ${JSON.stringify({ viewport: width, layout, failureProof, coverProof, stripProof, trayGeometry })}`);
      }
    }

    if (process.argv.includes("--reels-immersive") && target === "/reels") {
      const feed = page.locator("[data-reels-mobile-feed]");
      const firstOverlay = page.locator('[data-reel-slide][data-reel-index="0"] .reels-mobile-top-overlay');
      const assertOverlayVisible = async (expected, stage) => {
        const rect = await firstOverlay.evaluate((node) => ({ ...node.getBoundingClientRect().toJSON(), viewport: innerHeight }));
        const visible = rect.bottom > 0 && rect.top < rect.viewport;
        if (visible !== expected) throw new Error(`Reels first-slide top overlay visibility at ${stage}: ${JSON.stringify({ expected, rect })}`);
      };
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      if (overflow.document > overflow.viewport + 1 || overflow.body > overflow.viewport + 1) throw new Error(`Immersive Reels horizontal overflow: ${JSON.stringify(overflow)}`);
      if (await page.locator(".mobile-top-bar:visible,.mobile-bottom-dock:visible,nav.app-bottom-nav:visible").count()) throw new Error("Shared mobile top bar or bottom navigation is visible on Reels");
      const firstSlide = page.locator('[data-reel-slide][data-reel-index="0"]');
      const fullScreen = await firstSlide.evaluate((node) => ({ height: node.getBoundingClientRect().height, viewport: innerHeight }));
      if (fullScreen.height !== fullScreen.viewport) throw new Error(`Immersive Reel does not fill the viewport: ${JSON.stringify(fullScreen)}`);
      const identity = await firstSlide.evaluate((node) => ({
        hasPortrait: node.querySelector(".reels-mobile-character img")?.naturalWidth > 0,
        name: node.querySelector(".reels-mobile-character span")?.textContent?.trim(),
        caption: node.querySelector(".reels-mobile-identity p")?.textContent?.trim(),
        handles: node.querySelectorAll(".reels-mobile-handle").length,
      }));
      if (!identity.hasPortrait || !identity.name || !identity.caption || identity.handles !== 0 || /@[\w.-]+/.test(identity.name)) throw new Error(`Mobile Reel identity should show a portrait, name, caption, and no handle: ${JSON.stringify(identity)}`);
      if (await firstOverlay.evaluate((node) => getComputedStyle(node).position) !== "absolute") throw new Error("Reels top controls are not anchored in normal first-slide flow");
      await assertOverlayVisible(true, "feed top");
      if (await firstSlide.locator("video").count() !== 1 || await page.locator("[data-reel-slide] video").count() !== 1) throw new Error("QA mode should mount only the active Reel video");
      const video = firstSlide.locator("video");
      await page.waitForFunction(() => {
        const current = document.querySelector('[data-reel-slide][data-active="true"] video');
        return current && current.readyState >= 2 && !current.paused && current.muted;
      }, { timeout: 10000 });
      if (width === 393) {
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-immersive-playing-393.png"), animations: "disabled" });
        await video.click({ position: { x: 175, y: 350 } });
        await page.waitForFunction(() => document.querySelector('[data-reel-slide][data-active="true"] video')?.paused === true);
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-immersive-paused-393.png"), animations: "disabled" });
        await page.getByRole("button", { name: "Play reel" }).click();
        await page.waitForFunction(() => { const current = document.querySelector('[data-reel-slide][data-active="true"] video'); return current && !current.paused; });
      }
      let railGeometry;
      if (width === 393) {
        railGeometry = await firstSlide.evaluate((node) => {
          const rail = node.querySelector(".reels-mobile-rail").getBoundingClientRect();
          const identity = node.querySelector(".reels-mobile-identity").getBoundingClientRect();
          const strip = node.querySelector(".reels-mobile-message-strip").getBoundingClientRect();
          return { railBottom: rail.bottom, stripTop: strip.top, identityRight: identity.right, railLeft: rail.left };
        });
        if (railGeometry.railBottom > railGeometry.stripTop || railGeometry.identityRight > railGeometry.railLeft) throw new Error(`Reel actions, identity, and message strip overlap: ${JSON.stringify(railGeometry)}`);
        await firstSlide.getByRole("button", { name: "More", exact: true }).click();
        if (!(await page.getByRole("dialog", { name: "Reel details" }).isVisible())) throw new Error("Reels More sheet did not open above the immersive video");
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-immersive-more-393.png"), animations: "disabled" });
        await page.mouse.click(190, 260);
        await page.waitForTimeout(100);
        await page.getByRole("button", { name: "Filter Reels" }).click();
        if (!(await page.getByRole("dialog", { name: "Filter Reels" }).isVisible())) throw new Error("Reels filter sheet did not open");
        await page.getByRole("button", { name: "Close filters" }).click();
      }

      await feed.evaluate((node) => node.scrollTo({ top: innerHeight, behavior: "instant" }));
      await page.waitForFunction(() => document.querySelector('[data-reel-slide][data-active="true"]')?.getAttribute("data-reel-index") === "1", { timeout: 5000 });
      await assertOverlayVisible(false, "one Reel down");
      if (width === 393) await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-immersive-scrolled-393.png"), animations: "disabled" });
      await feed.evaluate((node) => node.scrollTo({ top: innerHeight * 2, behavior: "instant" }));
      await page.waitForTimeout(80);
      await assertOverlayVisible(false, "several Reels down");
      await feed.evaluate((node) => node.scrollTo({ top: innerHeight * 2 - 80, behavior: "instant" }));
      await page.waitForTimeout(80);
      await assertOverlayVisible(false, "small upward scroll mid-feed");
      await feed.evaluate((node) => node.scrollTo({ top: innerHeight * 0.6, behavior: "instant" }));
      await page.waitForTimeout(80);
      await assertOverlayVisible(false, "partial return toward Reel 1");
      await feed.evaluate((node) => node.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(100);
      await assertOverlayVisible(true, "absolute feed top");
      if (width === 393) {
        await firstOverlay.getByRole("button", { name: "Filter Reels" }).click();
        await feed.evaluate((node) => node.scrollTo({ top: innerHeight, behavior: "instant" }));
        await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-labelledby="reels-filter-title"]'));
        await assertOverlayVisible(false, "filter sheet closes when its anchor leaves");
        await feed.evaluate((node) => node.scrollTo({ top: 0, behavior: "instant" }));
        await page.waitForTimeout(80);
        await page.getByRole("button", { name: "Back to previous screen" }).click();
        await page.waitForFunction(() => document.querySelector('[data-home-architecture="dedicated"]') !== null);
        await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Reels" }).click();
        await page.waitForSelector("[data-reels-mobile-feed]");
        await page.locator('[data-reel-slide][data-active="true"]').getByRole("button", { name: /^Message / }).click();
        await page.waitForFunction(() => location.pathname === "/messages" && document.querySelector(".mobile-thread-active"));
      }
      console.log(`Immersive Reels QA passed ${JSON.stringify({ viewport: width, fullScreen, railGeometry: width === 393 ? railGeometry : undefined, overlay: "first-slide flow; hidden until absolute top" })}`);
    }

    if (process.argv.includes("--reels-v3") && target === "/reels" && width === 393) {
      const feed = page.locator("[data-reels-mobile-feed]");
      const dock = page.getByRole("navigation", { name: "Main navigation" });
      const topOverlay = page.locator(".reels-mobile-top-overlay");
      const slide = (index) => page.locator(`[data-reel-slide][data-reel-index="${index}"]`);
      const noOverflow = async (stage) => {
        const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        if (size.document > size.viewport + 1 || size.body > size.viewport + 1) throw new Error(`Mobile Reels overflow at ${stage}: ${JSON.stringify(size)}`);
      };
      if (!(await feed.count()) || await dock.isVisible()) throw new Error("Mobile Reels feed did not render in immersive mode without the shared app dock");
      if (await page.locator(".mobile-top-layer").count() || await page.locator(".reels-toolbar").isVisible()) throw new Error("The shared mobile top bar or desktop toolbar appeared on Reels");
      const initial = await page.evaluate(() => {
        const feedNode = document.querySelector("[data-reels-mobile-feed]");
        const first = document.querySelector("[data-reel-slide]");
        return { snap: getComputedStyle(feedNode).scrollSnapType, feed: feedNode.getBoundingClientRect().toJSON(), slide: first?.getBoundingClientRect().toJSON(), count: document.querySelectorAll("[data-reel-slide]").length, activeVideos: document.querySelectorAll("[data-reel-slide][data-active=true] video").length };
      });
      if (!initial.snap.includes("mandatory") || Math.abs(initial.slide.height - height) > 1 || initial.feed.width !== width) throw new Error(`Mobile Reel is not a viewport-height native snap slide: ${JSON.stringify(initial)}`);
      if (initial.activeVideos > 1) throw new Error(`More than one active video is mounted: ${initial.activeVideos}`);
      await noOverflow("initial Reel");

      await page.getByRole("button", { name: /Filter Reels/ }).click();
      const filterSheet = page.getByRole("dialog", { name: "Filter Reels" });
      if (!(await filterSheet.isVisible())) throw new Error("Reel filter sheet did not open");
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-filter-393.png"), animations: "disabled" });
      for (const label of ["Favorites", "Recent", "Character"]) {
        if (!(await filterSheet.isVisible())) await page.getByRole("button", { name: /Filter Reels/ }).click();
        await filterSheet.getByRole("button", { name: label }).click();
        await page.waitForTimeout(120);
        if (label === "Character") {
          const picker = filterSheet.locator("select");
          if (!(await picker.isVisible())) throw new Error("Character filter did not show its picker inside the filter sheet");
          const options = await picker.locator("option").count();
          if (options > 1) await picker.selectOption({ index: 1 });
        }
      }
      await filterSheet.getByRole("button", { name: /Close filters/ }).click();
      await page.getByRole("button", { name: /Filter Reels/ }).click();
      await filterSheet.getByRole("button", { name: "All Videos" }).click();
      if (await page.getByRole("dialog", { name: "Filter Reels" }).count()) throw new Error("Choosing a Reel filter did not close the sheet");

      const initialCount = initial.count;
      if (initialCount > 1) {
        await page.mouse.move(190, 680);
        await page.mouse.wheel(0, 690);
        await page.waitForFunction(() => document.querySelector('[data-reel-slide][data-active="true"]')?.getAttribute("data-reel-index") === "1", { timeout: 5000 });
        await page.waitForTimeout(500);
        const nextMetrics = await page.evaluate(() => ({ index: document.querySelector('[data-reel-slide][data-active="true"]')?.getAttribute("data-reel-index"), scrollTop: Math.round(document.querySelector("[data-reels-mobile-feed]").scrollTop), height: innerHeight, activeVideos: document.querySelectorAll("[data-reel-slide][data-active=true] video").length }));
        if (Math.abs(nextMetrics.scrollTop - nextMetrics.height) > 3) throw new Error(`Vertical wheel gesture did not snap cleanly to Reel 2: ${JSON.stringify(nextMetrics)}`);
        if (nextMetrics.activeVideos > 1) throw new Error("Multiple videos mounted while advancing the Reels feed");
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-next-393.png"), animations: "disabled" });
        await page.mouse.wheel(0, -690);
        await page.waitForFunction(() => document.querySelector('[data-reel-slide][data-active="true"]')?.getAttribute("data-reel-index") === "0", { timeout: 5000 });
      } else {
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-next-393.png"), animations: "disabled" });
      }

      const playableVideo = page.locator('[data-reel-slide][data-active="true"] video');
      if (await playableVideo.count()) {
        await playableVideo.click({ position: { x: 190, y: 350 } });
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-paused-393.png"), animations: "disabled" });
        await page.getByRole("button", { name: "Play reel" }).click().catch(() => {});
        await page.waitForTimeout(100);
      } else {
        await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-paused-393.png"), animations: "disabled" });
        console.log("No playable local video fixture is available; preview fallback rendered without fabricated playback.");
      }

      const currentSlide = page.locator('[data-reel-slide][data-active="true"]');
      const favorite = currentSlide.getByRole("button", { name: /^(Favorite|Remove favorite)$/ });
      const oldFavoriteLabel = await favorite.getAttribute("aria-label");
      await favorite.click();
      await page.waitForTimeout(120);
      const newFavoriteLabel = await page.locator('[data-reel-slide][data-active="true"]').getByRole("button", { name: /^(Favorite|Remove favorite)$/ }).getAttribute("aria-label");
      if (newFavoriteLabel === oldFavoriteLabel) throw new Error("Reel favorite action did not update its active state");
      await page.locator('[data-reel-slide][data-active="true"]').getByRole("button", { name: /^(Favorite|Remove favorite)$/ }).click();

      const referenceAction = page.locator('[data-reel-slide][data-active="true"] .reels-mobile-rail button').nth(3);
      const oldReferenceLabel = await referenceAction.getAttribute("aria-label");
      await referenceAction.click();
      await page.waitForTimeout(120);
      const referenceLabel = await page.locator('[data-reel-slide][data-active="true"] .reels-mobile-rail button').nth(3).getAttribute("aria-label");
      const referencePressed = await page.locator('[data-reel-slide][data-active="true"] .reels-mobile-rail button').nth(3).getAttribute("aria-pressed");
      const expectedReferenceLabel = oldReferenceLabel === "Use as reference" ? "Remove reference" : "Use as reference";
      if (referenceLabel !== expectedReferenceLabel || referencePressed !== String(expectedReferenceLabel === "Remove reference")) throw new Error(`Reel reference action did not update its active state: ${JSON.stringify({ oldReferenceLabel, referenceLabel, referencePressed })}`);
      await page.locator('[data-reel-slide][data-active="true"] .reels-mobile-rail button').nth(3).click();

      await page.locator('[data-reel-slide][data-active="true"]').getByRole("button", { name: "Notes" }).click();
      const mediaDetail = page.locator(".media-detail-backdrop");
      if (!(await mediaDetail.isVisible())) throw new Error("Notes action did not open the existing Media Detail surface");
      await page.getByRole("button", { name: "Close media detail" }).click();
      await page.waitForTimeout(100);
      if (await dock.getByRole("button", { name: "Reels" }).getAttribute("aria-current") !== "page") throw new Error("Closing Media Detail did not return to the Reels route");

      await page.locator('[data-reel-slide][data-active="true"]').getByRole("button", { name: "More" }).click();
      const more = page.getByRole("dialog", { name: "Reel details" });
      if (!(await more.isVisible())) throw new Error("More actions did not open the mobile bottom sheet");
      await page.screenshot({ path: path.join(outputDir, "mobile-v3-reels-more-393.png"), animations: "disabled" });
      await more.getByRole("button", { name: "Add to Collection" }).click();
      const collections = page.getByRole("dialog", { name: "Add to Collection" });
      if (!(await collections.isVisible())) throw new Error("Add to Collection did not open its mobile sheet");
      await collections.getByRole("button", { name: "Cancel" }).click();
      await page.locator('[data-reel-slide][data-active="true"]').getByRole("button", { name: "More" }).click();
      await page.keyboard.press("Escape");
      if (await page.getByRole("dialog", { name: "Reel details" }).count()) throw new Error("Escape did not close the More sheet");

      if (initialCount > 1) {
        await page.mouse.wheel(0, initialCount * height);
        await page.waitForTimeout(700);
        const lastIndex = await page.locator('[data-reel-slide][data-active="true"]').getAttribute("data-reel-index");
        if (Number(lastIndex) !== initialCount - 1) throw new Error(`Reels did not reach the last snap boundary: ${lastIndex}/${initialCount}`);
        await page.mouse.wheel(0, height);
        await page.waitForTimeout(300);
        if (await page.locator('[data-reel-slide][data-active="true"]').getAttribute("data-reel-index") !== lastIndex) throw new Error("Reels moved beyond the last item boundary");
      }
      await noOverflow("interaction sequence");
      console.log(`Mobile Reels interactions passed ${JSON.stringify({ ...initial, activeIndex: await page.locator('[data-reel-slide][data-active="true"]').getAttribute("data-reel-index") })}`);
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
      for (const [label, pathname, dockVisible] of [["Explore", "/explore", true], ["Reels", "/reels", false], ["Library", "/library", true], ["Create a scene", "/create", false]]) {
        await dock.getByRole("button", { name: label }).click();
        await page.waitForTimeout(130);
        if (new URL(page.url()).pathname !== pathname) throw new Error(`Mobile dock ${label} action did not navigate to ${pathname}`);
        if ((await dock.isVisible()) !== dockVisible) throw new Error(`Mobile dock visibility was incorrect on ${pathname}`);
        if (pathname === "/reels") {
          await page.getByRole("button", { name: "Back to previous screen" }).click();
          await page.waitForFunction(() => location.pathname === "/explore" && document.querySelector(".explore-surface") !== null);
        } else if (!dockVisible) {
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
    if (process.platform === "win32") {
      try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
    } else {
      try { child.kill("SIGTERM"); } catch {}
    }
    child.unref();
  }
}
