import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ?? "/";
const widths = process.argv.includes("--all")
  ? [360, 393, 430, 768, 1024, 1440]
  : [Number(process.argv[3] ?? 393)];
const outputDir = path.join(root, ".artifacts", "visual");
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = Number(portArg?.split("=")[1] ?? 3210);
const baseUrl = `http://127.0.0.1:${port}`;
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
const child = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  detached: process.platform === "win32",
  stdio: "ignore",
  windowsHide: true,
  env: { ...process.env, FLEX_SCENES_QA_WORKTREE_ID: worktreeId },
});

let browser;
try {
  const identity = await waitForOwnedApp(child, worktreeId);
  console.log(`Visual QA server: ${baseUrl} (commit ${identity.commit}, worktree ${identity.worktreeId})`);
  await mkdir(outputDir, { recursive: true });
  if (target === "/" && !process.argv.includes("--live")) {
    for (const file of await readdir(outputDir)) {
      if (/^home-(360|393|430|768|1024|1440|live-393)\.png$/.test(file)) await rm(path.join(outputDir, file));
    }
  }
  browser = await chromium.launch({ headless: true });
  for (const width of widths) {
    const page = await browser.newPage({
      viewport: { width, height: width < 768 ? 852 : 960 },
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
      if (await page.locator('[data-ui-v2="home"]').count() !== 1) throw new Error("Current UI V2 Home marker missing from rendered page");
      if (await page.locator(".home-creative-actions").count()) throw new Error("Dashboard-style creative text actions remain visible in Home feed");
      if (width < 768 && await page.getByRole("navigation", { name: "Main navigation" }).locator("button").count() !== 5) throw new Error("Mobile navigation must contain five actions");
      if (width >= 768 && !(await page.locator(".app-desktop-nav").isVisible())) throw new Error("Desktop navigation did not render");
    }
    const metrics = await page.evaluate(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { width: Math.round(box.width), height: Math.round(box.height), left: Math.round(box.left), top: Math.round(box.top) };
      };
      return { viewport: innerWidth, document: document.documentElement.scrollWidth, header: rect(".app-header"), storyRing: rect(".home-story-ring"), media: rect(".home-post-media"), create: rect(".bottom-nav-create .bottom-nav-icon"), homeMarker: !!document.querySelector('[data-ui-v2="home"]') };
    });
    if (metrics.document > metrics.viewport + 1) throw new Error(`Horizontal overflow at ${width}px: ${metrics.document}px document / ${metrics.viewport}px viewport`);
    if (target === "/" && width === 393 && (!metrics.media || metrics.media.width < 0.95 * metrics.viewport)) throw new Error(`Home media is not edge-to-edge enough: ${JSON.stringify(metrics.media)}`);
    const name = target === "/" ? `home${process.argv.includes("--live") ? "-live" : ""}-${width}` : `${target.replace(/^\/+|\/+$/g, "").replaceAll("/", "-") || "home"}-${width}`;
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
