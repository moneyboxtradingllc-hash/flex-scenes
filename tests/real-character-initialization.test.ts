import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { repository } from "../lib/repository";
import { db } from "../lib/db";
import { seedDatabase } from "../lib/seed";
import { emptyCharacterProfile } from "../lib/brain-defaults";
import type { MediaAsset } from "../lib/domain";

describe("real character initialization", () => {
  it("uses blank real-character profile defaults", () => {
    const profile = emptyCharacterProfile("qa-real-character");
    expect(profile.initiativeLevel).toBe("REACTIVE");
    expect(profile.adultCharacter).toBe(false);
    expect(profile.conversationalProfile).toMatchObject({ speakingStyle: "", vocabulary: [], humorStyle: "", attitude: "", lore: "", relationshipNotes: "", boundaries: [] });
    expect(profile.creativeProfile.favoriteEnvironments).toEqual([]);
    expect(profile.creativeProfile.wardrobeCategories).toEqual([]);
    expect(profile.creativeProfile.preferredLighting).toEqual([]);
  });

  it("does not turn a character's first media into a canonical reference during initialization", () => {
    const id = repository.createCharacter(`QA Empty ${randomUUID()}`).id;
    const mediaId = randomUUID();
    const asset: MediaAsset = { id: mediaId, characterId: id, type: "image", url: "/imports/qa.png", posterUrl: "/imports/qa.png", title: "QA image", caption: "", prompt: "", providerId: "local-import", settingsJson: "{}", parentId: null, isReference: false, createdAt: new Date().toISOString(), favorite: false };
    repository.saveMedia(asset);
    seedDatabase();
    expect(repository.characterReferences(id)).toEqual([]);
    expect(repository.characterProfile(id)?.conversationalProfile.speakingStyle).toBe("");
    expect(repository.characterProfile(id)?.creativeProfile.favoriteEnvironments).toEqual([]);
    // Keep the test database clean for later specs.
    db.prepare("DELETE FROM media WHERE id=?").run(mediaId);
    db.prepare("DELETE FROM messages WHERE conversationId=(SELECT id FROM conversations WHERE characterId=?)").run(id);
    db.prepare("DELETE FROM conversations WHERE characterId=?").run(id);
    db.prepare("DELETE FROM characterBrainProfiles WHERE characterId=?").run(id);
    db.prepare("DELETE FROM creativeMemories WHERE characterId=?").run(id);
    db.prepare("DELETE FROM initiativeStates WHERE characterId=?").run(id);
    db.prepare("DELETE FROM characters WHERE id=?").run(id);
  });

  it("sets a portrait upload as a noncanonical active Face reference exactly once", () => {
    const character = repository.createCharacter(`Portrait QA ${randomUUID()}`);
    const id = randomUUID();
    const asset: MediaAsset = { id, characterId: character.id, type: "image", url: "/imports/qa-portrait.png", posterUrl: "/imports/qa-portrait.png", title: "QA portrait", caption: "", prompt: "", providerId: "local-import", settingsJson: "{}", parentId: null, isReference: true, createdAt: new Date().toISOString(), favorite: false };
    repository.saveCharacterPortraitReference(asset);
    expect(repository.character(character.id)?.portraitUrl).toBe(asset.url);
    const ref = repository.characterReferences(character.id).find((item) => item.mediaId === id && item.role === "face");
    expect(ref).toMatchObject({ canonical: false, active: true });
    expect(repository.media().filter((item) => item.id === id)).toHaveLength(1);
    expect(repository.characterReferences(character.id).filter((item) => item.mediaId === id && item.role === "face")).toHaveLength(1);
    repository.removeCharacterReference(character.id, id, "face");
    db.prepare("DELETE FROM media WHERE id=?").run(id);
    db.prepare("UPDATE characters SET portraitUrl='' WHERE id=?").run(character.id);
    db.prepare("DELETE FROM messages WHERE conversationId=(SELECT id FROM conversations WHERE characterId=?)").run(character.id);
    db.prepare("DELETE FROM conversations WHERE characterId=?").run(character.id);
    db.prepare("DELETE FROM characterBrainProfiles WHERE characterId=?").run(character.id);
    db.prepare("DELETE FROM creativeMemories WHERE characterId=?").run(character.id);
    db.prepare("DELETE FROM initiativeStates WHERE characterId=?").run(character.id);
    db.prepare("DELETE FROM characters WHERE id=?").run(character.id);
  });
});
