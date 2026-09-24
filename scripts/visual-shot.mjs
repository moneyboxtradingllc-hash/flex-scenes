import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.VISUAL_BASE_URL ?? "http://localhost:3200";
const target = process.argv[2] ?? "/";
const widths = process.argv.includes("--all")
  ? [360, 393, 430, 768, 1024, 1440]
  : [Number(process.argv[3] ?? 393)];
const outputDir = path.join(root, ".artifacts", "visual");

async function waitForApp() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd run dev -- --port 3200"]
    : ["run", "dev", "--", "--port", "3200"];
  const child = spawn(command, args, { cwd: root, detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Flex Scenes did not become ready at ${baseUrl}`);
}

await waitForApp();
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of widths) {
    const page = await browser.newPage({
      viewport: { width, height: width < 768 ? 852 : 960 },
      deviceScaleFactor: width < 768 ? 2 : 1,
      isMobile: width < 768,
      hasTouch: width <= 768,
    });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    await page.goto(new URL(target, baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    if (browserErrors.length) throw new Error(`Browser console errors at ${width}px: ${browserErrors.join(" | ")}`);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const brokenImages = await page.evaluate(() => Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.currentSrc || img.src));
    if (brokenImages.length) throw new Error(`Broken Home images at ${width}px: ${brokenImages.join(", ")}`);
    if (target === "/") {
      if (await page.getByRole("heading", { name: "Flex Scenes home" }).count() !== 1) throw new Error("Home content did not render");
      if (width < 768 && await page.getByRole("navigation", { name: "Main navigation" }).locator("button").count() !== 5) throw new Error("Mobile navigation must contain five actions");
      if (width >= 768 && !(await page.locator(".app-desktop-nav").isVisible())) throw new Error("Desktop navigation did not render");
    }
    const layout = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    if (layout.document > layout.viewport + 1) throw new Error(`Horizontal overflow at ${width}px: document is ${layout.document}px wide`);
    const routeName = target === "/" ? "home" : target.replace(/^\/+|\/+$/g, "").replaceAll("/", "-") || "home";
    const output = path.join(outputDir, `${routeName}-${width}.png`);
    await page.screenshot({ path: output, animations: "disabled" });
    console.log(output);
    if (process.argv.includes("--smoke") && target === "/" && width === 393) {
      const action = page.getByRole("button", { name: /^(Animate|Remix video)$/ }).first();
      if (await action.count() !== 1) throw new Error("Home media has no working create handoff action");
      await action.click();
      await page.waitForTimeout(250);
      if (new URL(page.url()).pathname !== "/create") throw new Error(`Home media action did not open Create Studio (actual path: ${new URL(page.url()).pathname}; page: ${(await page.locator("main").innerText()).slice(0, 240)})`);
      console.log("Home media to Create Studio handoff passed");
    }
    await page.close();
  }
} finally {
  await browser.close();
}
