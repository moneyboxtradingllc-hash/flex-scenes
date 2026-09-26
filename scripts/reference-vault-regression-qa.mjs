import { chromium } from "playwright";

const origin = process.env.REFERENCE_VAULT_QA_URL ?? "http://127.0.0.1:3210";
const routes = ["/", "/explore", "/reels", "/library", "/messages", "/character", "/create", "/character/references"];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const results = [];
try {
  for (const route of routes) {
    const response = await page.goto(origin + route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    results.push({ route, status: response?.status() ?? 0, horizontalOverflow: layout.document > layout.viewport });
  }
  if (results.some((result) => result.status !== 200 || result.horizontalOverflow)) throw new Error(`Mobile route regression: ${JSON.stringify(results)}`);
  await page.goto(origin + "/character/references", { waitUntil: "domcontentloaded" });
  const chrome = await page.evaluate(() => ({ vault: Boolean(document.querySelector("[data-testid='reference-vault']")), sharedTopBar: Boolean(document.querySelector(".mobile-top-bar")), sharedDock: Boolean(document.querySelector(".mobile-bottom-dock")) }));
  if (!chrome.vault || chrome.sharedTopBar || chrome.sharedDock) throw new Error(`Vault focus chrome is incorrect: ${JSON.stringify(chrome)}`);
  console.log(JSON.stringify({ routes: results, referenceVaultChrome: chrome }, null, 2));
} finally {
  await browser.close();
}
