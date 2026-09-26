import { describe, expect, it } from "vitest";
import { characterProfileHasMeaningfulContent, profileDraftForCharacter } from "../lib/character-profile-drafts";
import { emptyCharacterProfile } from "../lib/brain-defaults";
import type { Character } from "../lib/domain";
import { repository } from "../lib/repository";
import { db } from "../lib/db";
import { characterDirectorService } from "../lib/character-director";

const names = ["Valeria", "Ms Juicy", "Tiona", "Ms Orlando", "Nyra", "Asian Character"];

describe("assistant character profile drafts", () => {
  it("provides six distinct, adult, structured drafts without media or provider dependencies", () => {
    const styles = new Set<string>();
    for (const name of names) {
      const character = { id: `qa-${name}`, name } as Pick<Character, "id" | "name">;
      const draft = profileDraftForCharacter(character);
      expect(draft, name).toBeDefined();
      expect(draft!.characterPatch.description).not.toBe("");
      expect(draft!.characterPatch.personality).not.toBe("");
      expect(draft!.profile.adultCharacter).toBe(true);
      expect(draft!.profile.ageVerifiedAdult).toBe(true);
      expect(draft!.profile.creativeProfile.visualBrief).not.toBe("");
      expect(draft!.profile.creativeProfile.wardrobeCategories.length).toBeGreaterThan(0);
      expect(draft!.profile.creativeProfile.favoriteSceneTypes.length).toBeGreaterThan(0);
      expect(draft!.profile.conversationalProfile.seductionStyle).not.toBe("");
      expect(draft!.profile.conversationalProfile.flirtIntensity).toBeGreaterThan(0);
      expect(draft!.profile.conversationalProfile.naughtiness).toBeGreaterThan(0);
      expect(draft!.profile.conversationalProfile.favoriteTeasingPatterns.length).toBeGreaterThan(0);
      expect(draft!.profile.conversationalProfile.permissionStyle).not.toBe("");
      styles.add(draft!.profile.conversationalProfile.seductionStyle);
      expect(draft!.profile.conversationalProfile.boundaries).toContain("Keep default profile copy seductive and suggestive without describing explicit sexual acts.");
    }
    expect(styles.size).toBe(6);
  });

  it("offers canonical drafts for period variants and requires explicit approval before replacing real content", () => {
    const character = { id: "qa-orlando", name: "Ms. Orlando", description: "", personality: "", identityNotes: "" } as Character;
    expect(profileDraftForCharacter(character)).toBeDefined();
    expect(characterProfileHasMeaningfulContent(character, emptyCharacterProfile(character.id))).toBe(false);
    const existing = emptyCharacterProfile(character.id);
    existing.conversationalProfile.speakingStyle = "User-authored voice";
    expect(characterProfileHasMeaningfulContent(character, existing)).toBe(true);
  });

  it("persists an approved draft for Character Hub, Messages, and scene ideation", () => {
    const character = repository.createCharacter("Ms Orlando");
    const conversation = repository.conversationForCharacter(character.id)!;
    const draft = profileDraftForCharacter(character)!;
    try {
      repository.applyCharacterProfileDraft(character.id, draft.characterPatch, draft.profile);
      const saved = repository.characterProfile(character.id)!;
      expect(saved.conversationalProfile.seductionStyle).toContain("Sweet-but-naughty");
      expect(saved.conversationalProfile.permissionStyle).not.toBe("");
      expect(saved.creativeProfile.visualBrief).toContain("Romantic luxury");
      expect(repository.character(character.id).personality).toContain("Warm, playful");

      const context = characterDirectorService.buildContext(conversation.id);
      const response = characterDirectorService.conversationProvider.respond({ context, userText: "I have an idea." });
      expect(response.message).toContain("sweet and innocent");
      expect(response.creativeSignals).toMatchObject({ seductionStyle: saved.conversationalProfile.seductionStyle });
      expect(characterDirectorService.conversationProvider.respond({ context, userText: "No thanks, not now." }).message).toBe(saved.conversationalProfile.rejectionReaction);
      expect(characterDirectorService.conversationProvider.respond({ context, userText: "Yes, sounds good." }).message).toBe(saved.conversationalProfile.approvalReaction);
      const proposal = characterDirectorService.directorProvider.propose({ context, variationIndex: 2 });
      expect(proposal.sceneProposal!.proposedImagePlan).toContain(saved.creativeProfile.visualBrief);
      expect(proposal.sceneProposal!.naturalLanguagePitch).toContain("let you decide whether");
      expect(proposal.creativeSignals).toMatchObject({ seductionStyle: saved.conversationalProfile.seductionStyle });
    } finally {
      db.prepare("DELETE FROM messages WHERE conversationId=?").run(conversation.id);
      db.prepare("DELETE FROM conversationMemory WHERE conversationId=?").run(conversation.id);
      db.prepare("DELETE FROM conversationSummaries WHERE conversationId=?").run(conversation.id);
      db.prepare("DELETE FROM pinnedMemories WHERE conversationId=?").run(conversation.id);
      db.prepare("DELETE FROM conversations WHERE id=?").run(conversation.id);
      db.prepare("DELETE FROM characterBrainProfiles WHERE characterId=?").run(character.id);
      db.prepare("DELETE FROM creativeMemories WHERE characterId=?").run(character.id);
      db.prepare("DELETE FROM initiativeStates WHERE characterId=?").run(character.id);
      db.prepare("DELETE FROM characters WHERE id=?").run(character.id);
    }
  });
});
