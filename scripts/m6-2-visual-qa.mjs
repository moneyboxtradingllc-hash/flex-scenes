import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = "http://127.0.0.1:3201";
const shots = path.resolve(".artifacts/visual");
await fs.mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage();
const create = async (name) => {
  const response = await page.request.post(`${base}/api/actions`, { data: { action: "character-create", name, description: "" } });
  if (!response.ok()) throw new Error(`Could not create isolated QA character ${name}: ${response.status()}`);
  return response.json();
};
const emptyBoot = await (await page.request.get(`${base}/api/bootstrap`)).json();
if (emptyBoot.characters.length || emptyBoot.media.length || emptyBoot.characterReferences.length || emptyBoot.collections.length || emptyBoot.conversations.length || emptyBoot.messages.length) throw new Error("A clean QA database booted with demo or user content.");
const valeria = await create("Valeria");
let snapshot = await (await page.request.get(`${base}/api/bootstrap`)).json();
if (snapshot.characters.length !== 1 || snapshot.media.length !== 0 || snapshot.characterReferences.length !== 0) throw new Error("Fresh QA DB was not clean before onboarding.");
const blankValeria = snapshot.characters.find((character) => character.id === valeria.id);
if (!blankValeria || blankValeria.handle || blankValeria.portraitUrl || blankValeria.description || blankValeria.personality || blankValeria.identityNotes) throw new Error("New real-character record contains invented identity or portrait fields.");
await page.goto(`${base}/character?characterId=${valeria.id}`);
await page.getByRole("heading", { name: "Valeria" }).waitFor();
if (await page.locator(".character-mobile-portrait img").count()) throw new Error("Blank character unexpectedly rendered a portrait image.");
if (await page.locator(".character-mobile-portrait .library-character-portrait-fallback").textContent() !== "V") throw new Error("Blank character did not show the neutral initials fallback.");
if (!(await page.getByRole("button", { name: "Change Photo" }).isVisible())) throw new Error("Change Photo action is missing.");
await page.screenshot({ path: path.join(shots, "m6-2-character-hub-no-portrait-393.png"), fullPage: true });
await page.screenshot({ path: path.join(shots, "m6-2-character-hub-change-photo-393.png"), fullPage: true });
await page.goto(`${base}/character/references?characterId=${valeria.id}`);
await page.getByText("No Face references yet").waitFor();
if (await page.locator("[data-testid='library-media-thumbnail']").count()) throw new Error("Empty Reference Vault rendered placeholder media.");
await page.screenshot({ path: path.join(shots, "m6-2-reference-vault-empty-face-393.png"), fullPage: true });
await page.goto(`${base}/library`);
await page.getByText(/No media|No scenes|Nothing here/i).first().waitFor({ timeout: 5000 }).catch(() => undefined);
snapshot = await (await page.request.get(`${base}/api/bootstrap`)).json();
if (snapshot.media.length !== 0) throw new Error("Empty Library QA unexpectedly contains media.");
await page.screenshot({ path: path.join(shots, "m6-2-empty-real-library-393.png"), fullPage: true });

const portrait = (color) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#201329"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><ellipse cx="256" cy="228" rx="116" ry="142" fill="#d39a82"/><path d="M132 227c-9-113 48-176 132-176s136 56 123 185c-21-62-55-91-121-89-57 2-93 28-134 80" fill="#241923"/><path d="M112 512c12-125 72-186 144-186s132 61 144 186" fill="#563c53"/></svg>`);
const uploadPortraitThroughHub = async (color, fileName) => {
  await page.goto(`${base}/character?characterId=${valeria.id}`);
  await page.getByRole("heading", { name: "Valeria" }).waitFor();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Change Photo" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: fileName, mimeType: "image/svg+xml", buffer: portrait(color) });
  await page.waitForFunction(() => Boolean(document.querySelector(".character-mobile-portrait img")));
  snapshot = await (await page.request.get(`${base}/api/bootstrap`)).json();
  const asset = snapshot.media.find((item) => item.characterId === valeria.id && item.title === fileName);
  if (!asset) throw new Error(`Change Photo did not create ${fileName}.`);
  const refs = snapshot.characterReferences.filter((reference) => reference.characterId === valeria.id && reference.mediaId === asset.id && reference.role === "face");
  if (snapshot.media.filter((item) => item.id === asset.id).length !== 1 || refs.length !== 1 || refs[0].canonical || !refs[0].active || snapshot.characters.find((item) => item.id === valeria.id)?.portraitUrl !== asset.url) throw new Error("Change Photo did not save one active noncanonical Face reference and update the portrait exactly once.");
  await page.waitForFunction((url) => Array.from(document.images).some((image) => image.currentSrc.endsWith(url)), asset.url);
  return asset;
};
const first = await uploadPortraitThroughHub("#d2518b", "qa-portrait-one.svg");
await page.screenshot({ path: path.join(shots, "m6-2-character-hub-real-portrait-393.png"), fullPage: true });
const second = await uploadPortraitThroughHub("#5275b8", "qa-portrait-two.svg");
const videoAsPortrait = await page.request.post(`${base}/api/media/upload`, { multipart: { characterId: valeria.id, setAsPortrait: "true", file: { name: "not-a-portrait.mp4", mimeType: "video/mp4", buffer: Buffer.from("qa-video") } } });
if (videoAsPortrait.status() !== 400) throw new Error("Video file was accepted as a character portrait.");
snapshot = await (await page.request.get(`${base}/api/bootstrap`)).json();
const portraitRefs = snapshot.characterReferences.filter((ref) => ref.characterId === valeria.id && ref.role === "face");
if (snapshot.media.filter((asset) => asset.characterId === valeria.id && (asset.id === first.id || asset.id === second.id)).length !== 2 || portraitRefs.length !== 2 || portraitRefs.some((ref) => ref.canonical || !ref.active) || snapshot.characters.find((character) => character.id === valeria.id)?.portraitUrl !== second.url) throw new Error("Repeated portrait upload did not preserve two active noncanonical Face references and update portrait.");

const assertPortraitRendered = async (route) => {
  await page.goto(`${base}${route}`);
  await page.waitForFunction((url) => Array.from(document.images).some((image) => image.currentSrc.endsWith(url) && image.naturalWidth > 0 && image.getClientRects().length > 0), second.url);
};
for (const route of [
  `/character?characterId=${valeria.id}`,
  `/character/references?characterId=${valeria.id}`,
  `/create?characterId=${valeria.id}`,
  "/messages",
  `/?characterId=${valeria.id}`,
  `/explore?characterId=${valeria.id}`,
]) await assertPortraitRendered(route);

await page.goto(`${base}/messages`);
await page.getByRole("button", { name: /Open conversation with Valeria/ }).click();
await page.waitForFunction((url) => Array.from(document.images).some((image) => image.currentSrc.endsWith(url) && image.naturalWidth > 0 && image.getClientRects().length > 0), second.url);
await page.getByRole("button", { name: "Conversation details for Valeria" }).click();
await page.waitForFunction((url) => Array.from(document.images).some((image) => image.currentSrc.endsWith(url) && image.naturalWidth > 0), second.url);

await create("Nyra QA");
await page.evaluate(() => localStorage.removeItem("flex-scenes.active-character-id"));
await page.goto(`${base}/character`);
await page.getByRole("heading", { name: "Choose a Character" }).waitFor();
await page.getByRole("button", { name: /Valeria/ }).click();
await page.getByRole("heading", { name: "Valeria" }).waitFor();
await page.goto(`${base}/character`);
await page.getByRole("heading", { name: "Valeria" }).waitFor();
await page.evaluate(() => localStorage.removeItem("flex-scenes.active-character-id"));
await page.goto(`${base}/character`);
await page.getByRole("heading", { name: "Choose a Character" }).waitFor();
await page.getByRole("button", { name: /Nyra QA/ }).click();
await page.getByRole("heading", { name: "Nyra QA" }).waitFor();
await page.goto(`${base}/character`);
await page.getByRole("heading", { name: "Nyra QA" }).waitFor();
await page.evaluate(() => localStorage.removeItem("flex-scenes.active-character-id"));
await page.goto(`${base}/character`);
await page.getByRole("heading", { name: "Choose a Character" }).waitFor();
await page.screenshot({ path: path.join(shots, "m6-2-character-chooser-393.png"), fullPage: true });
const state = await page.evaluate(() => ({ broken: Array.from(document.images).filter((image) => image.complete && !image.naturalWidth).length, overflow: document.documentElement.scrollWidth > innerWidth }));
if (state.broken || state.overflow) throw new Error(`QA chooser has broken images or horizontal overflow: ${JSON.stringify(state)}`);
console.log(JSON.stringify({ emptyBoot: { characters: emptyBoot.characters.length, media: emptyBoot.media.length, references: emptyBoot.characterReferences.length, collections: emptyBoot.collections.length, conversations: emptyBoot.conversations.length, messages: emptyBoot.messages.length }, portraitUploads: { first: first.id, second: second.id, faceReferences: portraitRefs.length, canonical: portraitRefs.some((ref) => ref.canonical), propagated: ["Hub", "Vault", "Create", "Messages", "Conversation Details", "Home", "Explore"] }, selection: { valeriaReload: "passed", nyraReload: "passed", noStoredSelection: "chooser" }, chooser: state, screenshots: ["m6-2-character-hub-no-portrait-393.png", "m6-2-character-hub-change-photo-393.png", "m6-2-character-hub-real-portrait-393.png", "m6-2-reference-vault-empty-face-393.png", "m6-2-character-chooser-393.png", "m6-2-empty-real-library-393.png"] }));
await browser.close();
