import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = process.env.REFERENCE_VAULT_QA_URL ?? "http://127.0.0.1:3210";
const output = path.resolve(".artifacts/visual");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
page.on("requestfailed", (request) => console.log(`QA request failed: ${request.url()} ${request.failure()?.errorText ?? ""}`));
try {
  await page.goto(origin + "/api/bootstrap", { waitUntil: "domcontentloaded" });
  const seed = await page.evaluate(() => fetch("/api/bootstrap").then((r) => r.json()));
  const characterResponse = await page.evaluate(() => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-create", name: "Vault QA Character", description: "" }) }).then((r) => r.json()));
  const characterId = characterResponse.id;
  if (!characterId) throw new Error("Unable to create isolated Reference Vault QA character");
  const route = `/character/references?characterId=${encodeURIComponent(characterId)}`;
  const crossGuard = await page.evaluate(async ({ characterId, mediaId }) => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-reference-add-existing", characterId, mediaId, role: "face" }) }).then((r) => r.status), { characterId, mediaId: seed.media[0].id });
  if (crossGuard !== 409) throw new Error(`Cross-character assignment was not blocked without confirmation (${crossGuard})`);
  const screenshot = async (name) => page.screenshot({ path: path.join(output, name), fullPage: true, animations: "disabled" });
  await page.goto(origin + route, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='reference-vault']");
  await screenshot("mobile-v3-reference-vault-empty-393.png");
  const qaAssets = await page.evaluate(async (characterId) => {
    const portraitSvg = (tone, accent) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x2=".8" y2="1"><stop stop-color="${tone}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="182" r="96" fill="#e8c9c2"/><path d="M89 492c10-151 324-151 334 0" fill="#2b1d2b"/><path d="M158 169c5-105 190-135 205 15-50-42-135-45-205-15" fill="#211821"/></svg>`;
    const definitions = [["qa-face.svg", "face", "#573b57", "#b56d81", true], ["qa-body.svg", "body", "#334c60", "#7d9eae", true], ["qa-outfit.svg", "outfit", "#544930", "#b49363", false]];
    const uploaded = [];
    for (const [name, role, tone, accent, canonical] of definitions) {
      const form = new FormData(); form.set("characterId", characterId); form.set("referenceRole", role); form.set("canonical", String(canonical)); form.set("file", new File([portraitSvg(tone, accent)], name, { type: "image/svg+xml" }));
      const response = await fetch("/api/media/upload", { method: "POST", body: form }); if (!response.ok) throw new Error(`QA fixture upload failed (${response.status})`); uploaded.push(await response.json());
    }
    const videoResponse = await fetch("/api/qa/reel-playback-fixture.mp4");
    if (!videoResponse.ok) throw new Error("Local QA video fixture is unavailable for Motion-category coverage");
    const video = new File([await videoResponse.blob()], "qa-motion.mp4", { type: "video/mp4" });
    const videoForm = new FormData(); videoForm.set("characterId", characterId); videoForm.set("referenceRole", "motion"); videoForm.set("canonical", "true"); videoForm.set("file", video);
    const uploadedVideo = await fetch("/api/media/upload", { method: "POST", body: videoForm }); if (!uploadedVideo.ok) throw new Error("QA video upload failed"); uploaded.push(await uploadedVideo.json());
    return uploaded;
  }, characterId);
  const [faceAsset, bodyAsset, outfitAsset, video] = qaAssets;
  const uploadedMimeChecks = await page.evaluate(async (assets) => {
    const result = [];
    for (const asset of assets) {
      const response = await fetch(asset.url, asset.type === "video" ? { headers: { Range: "bytes=0-31" } } : undefined);
      result.push({ type: asset.type, status: response.status, contentType: response.headers.get("content-type"), contentRange: response.headers.get("content-range") });
    }
    return result;
  }, qaAssets);
  if (uploadedMimeChecks.some((item) => item.type === "image" ? item.status !== 200 || !item.contentType?.startsWith("image/") : item.status !== 206 || item.contentType !== "video/mp4" || !item.contentRange?.startsWith("bytes 0-31/"))) throw new Error(`Uploaded assets are not being served as image/video media: ${JSON.stringify(uploadedMimeChecks)}`);
  const seedAssets = seed.media.filter((asset) => asset.type === "image");
  const existingAsset = seedAssets[0];
  const existingRefResponse = await page.evaluate(async ({ characterId, mediaId }) => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-reference-add-existing", characterId, mediaId, role: "look", canonical: false, confirmCrossCharacter: true }) }).then((r) => r.status), { characterId, mediaId: existingAsset.id });
  if (existingRefResponse !== 200) throw new Error("Explicitly confirmed Add Existing Media failed");
  await page.evaluate(async ({ characterId, mediaId }) => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-reference-add-existing", characterId, mediaId, role: "look", canonical: false, confirmCrossCharacter: true }) }), { characterId, mediaId: existingAsset.id });
  const originalCount = seed.media.length;
  const mappedSnapshot = await page.evaluate(() => fetch("/api/bootstrap").then((r) => r.json()));
  if (mappedSnapshot.media.length !== originalCount + qaAssets.length) throw new Error("Add Existing Media duplicated a media file");
  await page.evaluate(async ({ characterId, mediaId }) => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-set-portrait", characterId, mediaId }) }), { characterId, mediaId: faceAsset.id });
  const portrait = await page.evaluate((characterId) => fetch("/api/bootstrap").then((r) => r.json()).then((snapshot) => snapshot.characters.find((item) => item.id === characterId)?.portraitUrl), characterId);
  if (portrait !== faceAsset.url) throw new Error("Set as Character Portrait did not update the character URL");
  if (video) {
    const videoPortraitStatus = await page.evaluate(async ({ characterId, mediaId }) => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-set-portrait", characterId, mediaId }) }).then((r) => r.status), { characterId, mediaId: video.id });
    if (videoPortraitStatus !== 400) throw new Error("A video reference was accepted as the character portrait");
  }
  await page.evaluate(async ({ characterId, mediaId }) => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-reference-update", characterId, mediaId, role: "face", referencePatch: { priority: 8, canonical: true, active: false } }) }), { characterId, mediaId: faceAsset.id });
  await page.evaluate(async ({ characterId, mediaId }) => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-reference-update", characterId, mediaId, role: "face", referencePatch: { active: true } }) }), { characterId, mediaId: faceAsset.id });
  await page.evaluate(async ({ characterId, mediaId }) => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-reference-bulk", characterId, mediaIds: [mediaId], referencePatch: { role: "other" } }) }), { characterId, mediaId: existingAsset.id });
  const retainedAsset = await page.evaluate((id) => fetch("/api/bootstrap").then((r) => r.json()).then((snapshot) => snapshot.media.find((asset) => asset.id === id)), existingAsset.id);
  if (!retainedAsset) throw new Error("Remove from Vault deleted the underlying Library asset");
  await page.route(new URL(existingAsset.url, origin).href, (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(350);
  console.log("Thumbnail states:", await page.locator("[data-testid='library-media-thumbnail']").evaluateAll((items) => items.map((item) => ({ state: item.getAttribute("data-thumbnail-state"), kind: item.getAttribute("data-media-kind"), image: item.querySelector("img")?.src }))));
  const brokenImages = await page.locator("img").evaluateAll((imgs) => imgs.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => ({ src: img.src, alt: img.alt, complete: img.complete, width: img.naturalWidth })));
  const broken = brokenImages.length;
  console.log("Broken <img> elements:", brokenImages);
  if (broken) throw new Error(`Broken image nodes detected in Reference Vault QA: ${broken}`);
  await screenshot("mobile-v3-reference-vault-face-393.png");
  for (const [label, filename] of [["Body", "mobile-v3-reference-vault-body-393.png"], ["Outfits", "mobile-v3-reference-vault-outfits-393.png"], ["Motion", "mobile-v3-reference-vault-motion-393.png"], ["All", "mobile-v3-reference-vault-all-393.png"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await screenshot(filename);
  }
  const removeResult = await page.evaluate(async ({ characterId, mediaId }) => fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "character-reference-remove", characterId, mediaId, role: "other" }) }).then(async (r) => ({ status: r.status, body: await r.json() })), { characterId, mediaId: existingAsset.id });
  const retainedAfterRemove = await page.evaluate(({ id, characterId }) => fetch("/api/bootstrap").then((r) => r.json()).then((snapshot) => ({ asset: snapshot.media.find((item) => item.id === id), mappings: snapshot.characterReferences.filter((ref) => ref.mediaId === id && ref.characterId === characterId) })), { id: existingAsset.id, characterId });
  console.log("Remove mapping check:", removeResult.status, retainedAfterRemove.mappings);
  if (!retainedAfterRemove.asset || retainedAfterRemove.mappings.length) throw new Error("Removing a mapping removed media or retained the mapping");
  await page.getByRole("button", { name: /Edit/ }).first().click();
  await screenshot("mobile-v3-reference-vault-detail-393.png");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.waitForTimeout(120);
  console.log("Select mode:", await page.getByRole("button", { name: "Done", exact: true }).count(), "tiles:", await page.locator(".reference-vault-grid article").count(), "toggles:", await page.locator(".reference-select-toggle").count());
  await page.locator(".reference-select-toggle").first().click();
  await screenshot("mobile-v3-reference-vault-bulk-393.png");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "＋ Add References" }).click();
  await screenshot("mobile-v3-reference-vault-upload-393.png");
  const fixture = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#33233d"/><circle cx="40" cy="32" r="15" fill="#d5afbd"/><path d="M12 78c2-20 54-20 56 0" fill="#76576b"/></svg>');
  await page.locator('input[type="file"][multiple]').setInputFiles([{ name: "qa-reference-one.svg", mimeType: "image/svg+xml", buffer: fixture }, { name: "qa-reference-two.svg", mimeType: "image/svg+xml", buffer: fixture }]);
  await page.getByText(/Upload complete · 2 succeeded · 0 failed/).waitFor({ timeout: 10000 });
  await screenshot("mobile-v3-reference-vault-upload-393.png");
  const uploadedSnapshot = await page.evaluate(() => fetch("/api/bootstrap").then((r) => r.json()));
  const batchUploads = uploadedSnapshot.media.filter((asset) => asset.title.startsWith("qa-reference-one") || asset.title.startsWith("qa-reference-two"));
  if (batchUploads.length !== 2 || batchUploads.some((asset) => !uploadedSnapshot.characterReferences.some((ref) => ref.mediaId === asset.id && ref.characterId === characterId))) throw new Error("Batch upload did not durably register all assets in the Vault");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Add Existing Media" }).click();
  await screenshot("mobile-v3-reference-vault-existing-picker-393.png");
  await page.getByRole("button", { name: "Close" }).click();
  await page.goto(origin + `/character?characterId=${encodeURIComponent(characterId)}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /References/ }).click();
  await screenshot("mobile-v3-character-hub-references-summary-393.png");
  await page.goto(origin + route, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.locator(".reference-select-toggle").first().click();
  await page.getByRole("button", { name: "Create with Selected" }).click();
  await page.waitForSelector("text=Character Defaults");
  await screenshot("mobile-v3-create-canonical-pack-393.png");
  const createStatus = await page.locator("body").innerText();
  if (!createStatus.includes("Character Defaults") || !createStatus.includes("face")) throw new Error("Create did not show the role-aware canonical pack");
  const createBrokenImages = await page.locator("img").evaluateAll((imgs) => imgs.filter((img) => img.getClientRects().length > 0 && getComputedStyle(img).visibility !== "hidden" && (!img.complete || img.naturalWidth === 0)).map((img) => ({ src: img.src, alt: img.alt, html: img.outerHTML })));
  if (createBrokenImages.length) throw new Error(`Create reference previews contain broken image elements: ${JSON.stringify(createBrokenImages)}`);

  for (const width of [390, 430]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 932 });
    await page.goto(origin + route, { waitUntil: "domcontentloaded" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`Reference Vault overflows at ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(origin + route, { waitUntil: "domcontentloaded" });
  await screenshot("desktop-reference-vault-1440.png");
  if (failures.length) throw new Error(`Browser errors: ${failures.join("; ")}`);
  for (const asset of uploadedSnapshot.media.filter((item) => item.characterId === characterId && item.url.startsWith("/imports/"))) await rm(path.resolve("public", asset.url.slice(1)), { force: true });
  console.log(JSON.stringify({ characterId, captureCount: 13, batchUploads: batchUploads.length, uploadedMimeChecks, existingMediaDuplicated: false, removedMappingRetainsMedia: true, brokenImages: broken, browserErrors: failures, providerCalls: 0, gpu: 0 }, null, 2));
} finally {
  await browser.close();
}
