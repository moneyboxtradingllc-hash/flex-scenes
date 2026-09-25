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
const captures = process.argv.includes("--home-v2")
  ? referenceCaptures
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
    const brokenImages = await page.evaluate(() => Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.currentSrc || img.src));
    if (brokenImages.length) throw new Error(`Broken images at ${width}px: ${brokenImages.join(", ")}`);
    if (target === "/") {
      if (await page.locator('[data-home-architecture="dedicated"]').count() !== 1) throw new Error("Dedicated Home V2 architecture missing from rendered route");
      if (width < 768 && await page.getByRole("navigation", { name: "Main navigation" }).locator("button").count() !== 5) throw new Error("Mobile navigation must contain five actions");
      if (width >= 768 && (!(await page.locator(".home-v2-left-nav").isVisible()) || !(await page.locator(".home-v2-right-rail").isVisible()))) throw new Error("Dedicated desktop Home rails did not render");
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
      const feed = rect(".home-v2-post");
      const storyRail = rect(".home-v2-stories");
      const right = rect(".home-v2-right-rail");
      return {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        header: rect(mobile ? ".home-v2-mobile-header" : ".home-v2-top-actions"),
        storyRing: rect(surface + " .home-v2-story-ring"),
        media: rect(surface + " .home-v2-media"),
        create: rect(".home-v2-mobile-nav .is-create > span"),
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
        homeMarker: !!document.querySelector('[data-ui-v2="home"]')
      };
    });
    if (metrics.document > metrics.viewport + 1) throw new Error(`Horizontal overflow at ${width}px: ${metrics.document}px document / ${metrics.viewport}px viewport`);
    if (target === "/" && process.argv.includes("--geometry") && width >= 1280) {
      if (metrics.feedRatio < 0.5 || metrics.feedRatio > 0.54) throw new Error(`Desktop Home feed ratio is outside the 0.50–0.54 target at ${width}px: ${metrics.feedRatio}`);
      if (Math.abs(metrics.storyRail.left - metrics.feedCard.left) > 1 || Math.abs(metrics.storyRail.width - metrics.feedCard.width) > 1) throw new Error(`Story rail and feed geometry do not align at ${width}px`);
      if (Math.abs(metrics.rightRail.left - (metrics.feedCard.left + metrics.feedCard.width + 20)) > 2) throw new Error(`Right rail spacing is outside the 20px target at ${width}px`);
    }
    if (target === "/" && width === 393 && (!metrics.media || metrics.media.width < 0.95 * metrics.viewport)) throw new Error(`Home media is not edge-to-edge enough: ${JSON.stringify(metrics.media)}`);
    const name = capture.name
      ? (process.argv.includes("--live") ? (capture.liveName ?? `${capture.name}-live`) : capture.name)
      : (target === "/" ? `home${process.argv.includes("--live") ? "-live" : ""}-${width}` : `${target.replace(/^\/+|\/+$/g, "").replaceAll("/", "-") || "home"}-${width}`);
    const output = path.join(outputDir, `${name}.png`);
    await page.screenshot({ path: output, animations: "disabled" });
    console.log(`${output} ${JSON.stringify(metrics)}`);
    if (process.argv.includes("--smoke") && target === "/" && width === 393) {
      const action = page.getByRole("button", { name: /^(Remix image|Remix video)$/ }).first();
      if (await action.count() !== 1) throw new Error("Home has no working remix-to-create action");
      await action.click();
      await page.waitForTimeout(250);
      if (new URL(page.url()).pathname !== "/create") throw new Error(`Home media action did not open Create Studio (${page.url()})`);
      console.log("Home media to Create Studio handoff passed");
    }
    if (process.argv.includes("--smoke") && target === "/" && width >= 1280) {
      const messageAction = page.locator(".home-v2-message-cta");
      const characterName = await messageAction.innerText();
      await messageAction.click();
      await page.waitForTimeout(150);
      if (new URL(page.url()).pathname !== "/messages") throw new Error("Desktop character card did not open Messages");
      await page.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });
      await page.locator(".home-v2-character-identity").click();
      await page.waitForTimeout(150);
      if (new URL(page.url()).pathname !== "/character") throw new Error("Desktop character card did not open Character Hub");
      console.log(`Desktop Home context actions passed (${characterName.trim()})`);
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
