import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { repository } from "../lib/repository";
import type { CharacterReferenceMeta, MediaAsset } from "../lib/domain";
import { resolveCanonicalReferences } from "../lib/reference-resolver";

const characterId = `qa-reference-character-${randomUUID()}`;
const now = new Date().toISOString();
const media: MediaAsset[] = [
  { id: "face-low", characterId, type: "image", url: "/qa/face-low.png", posterUrl: null, title: "Face low", caption: "", prompt: "", providerId: "local-import", settingsJson: "{}", parentId: null, isReference: true, createdAt: now, favorite: false },
  { id: "face-high", characterId, type: "image", url: "/qa/face-high.png", posterUrl: null, title: "Face high", caption: "", prompt: "", providerId: "local-import", settingsJson: "{}", parentId: null, isReference: true, createdAt: now, favorite: false },
  { id: "body", characterId, type: "image", url: "/qa/body.png", posterUrl: null, title: "Body", caption: "", prompt: "", providerId: "local-import", settingsJson: "{}", parentId: null, isReference: true, createdAt: now, favorite: false },
  { id: "motion", characterId, type: "video", url: "/qa/motion.mp4", posterUrl: null, title: "Motion", caption: "", prompt: "", providerId: "local-import", settingsJson: "{}", parentId: null, isReference: true, createdAt: now, favorite: false },
  { id: "motion-active", characterId, type: "video", url: "/qa/motion-active.mp4", posterUrl: null, title: "Motion active", caption: "", prompt: "", providerId: "local-import", settingsJson: "{}", parentId: null, isReference: true, createdAt: now, favorite: false },
];
const refs: CharacterReferenceMeta[] = [
  { characterId, mediaId: "face-low", role: "face", canonical: true, active: true, priority: 0, label: "", notes: "", createdAt: now },
  { characterId, mediaId: "face-high", role: "face", canonical: true, active: true, priority: 9, label: "", notes: "", createdAt: now },
  { characterId, mediaId: "body", role: "body", canonical: true, active: true, priority: 2, label: "", notes: "", createdAt: now },
  { characterId, mediaId: "motion", role: "motion", canonical: true, active: false, priority: 100, label: "", notes: "", createdAt: now },
  { characterId, mediaId: "motion-active", role: "video", canonical: true, active: true, priority: 1, label: "", notes: "", createdAt: now },
  { characterId: "another-character", mediaId: "body", role: "face", canonical: true, active: true, priority: 100, label: "", notes: "", createdAt: now },
  { characterId, mediaId: "missing", role: "face", canonical: true, active: true, priority: 100, label: "", notes: "", createdAt: now },
];

afterAll(() => {
  db.prepare("DELETE FROM jobReferences WHERE jobId IN (SELECT id FROM jobs WHERE characterId=?)").run(characterId);
  db.prepare("DELETE FROM jobEvents WHERE jobId IN (SELECT id FROM jobs WHERE characterId=?)").run(characterId);
  db.prepare("DELETE FROM usageLedger WHERE jobId IN (SELECT id FROM jobs WHERE characterId=?)").run(characterId);
  db.prepare("DELETE FROM jobs WHERE characterId=?").run(characterId);
  db.prepare("DELETE FROM characterReferenceMeta WHERE characterId=?").run(characterId);
  db.prepare("DELETE FROM characterReferences WHERE characterId=?").run(characterId);
  db.prepare("DELETE FROM media WHERE characterId=?").run(characterId);
  db.prepare("DELETE FROM media WHERE characterId=?").run(characterId);
  db.prepare("DELETE FROM characters WHERE id=?").run(characterId);
});

describe("Reference Vault domain", () => {
  it("resolves active canonical references deterministically, prioritizing within each identity role", () => {
    const resolved = resolveCanonicalReferences(characterId, "image", refs, media);
    expect(resolved.assetIds).toEqual(["face-high", "body", "face-low"]);
    expect(resolved.roles).toEqual({ "face-high": "face", body: "body", "face-low": "face" });
  });

  it("keeps video identity refs role mapped in video mode and excludes inactive or missing media", () => {
    const resolved = resolveCanonicalReferences(characterId, "video", refs, media, 5);
    expect(resolved.assetIds).toEqual(["face-high", "body", "motion-active", "face-low"]);
    const imageOnly = resolveCanonicalReferences(characterId, "video", refs, media, 5, { providerId: "image-only", label: "Image only", mode: "video", textPrompt: true, negativePrompt: false, referenceImages: true, referenceVideos: false, multipleReferences: true, imageToImage: false, imageToVideo: false, videoReference: false, aspectRatios: [], resolutions: [], durations: [], seed: false, guidance: false, generationCount: false, audio: false, advancedControls: [] });
    expect(imageOnly.assetIds).toEqual(["face-high", "body", "face-low"]);
    expect(Object.values(imageOnly.roles)).not.toContain("video");
  });

  it("removing a Vault mapping leaves the underlying media available", () => {
    db.prepare("INSERT INTO characters VALUES(?,?,?,?,?,?,?,?,?)").run(characterId, "Reference QA", "", "", "", "", "", "{}", now);
    const asset: MediaAsset = { ...media[0], id: `asset-${randomUUID()}`, title: "Persisted QA reference" };
    repository.saveMediaAsCharacterReference(asset, "face", true);
    expect(repository.characterReferences(characterId).some((item) => item.mediaId === asset.id)).toBe(true);
    const job = repository.createJob({ characterId, mode: "image", prompt: "QA only", aspectRatio: "4:5", preset: "Hero", referenceAssetIds: [asset.id], referenceAssetRoles: { [asset.id]: "face" } });
    expect(JSON.parse(job.settingsJson).referenceAssetRoles).toEqual({ [asset.id]: "face" });
    repository.removeCharacterReference(characterId, asset.id, "face");
    expect(repository.characterReferences(characterId).some((item) => item.mediaId === asset.id)).toBe(false);
    expect(repository.asset(asset.id)?.url).toBe(asset.url);
  });
});
