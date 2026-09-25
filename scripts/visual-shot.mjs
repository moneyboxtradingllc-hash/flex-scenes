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
const captures = process.argv.includes("--home-v2")
  ? referenceCaptures
  : process.argv.includes("--desktop-v3")
    ? desktopV3Captures
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
