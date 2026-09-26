import { describe, expect, it } from "vitest";
import { adjustProfileWithAssistant, characterProfileHasMeaningfulContent, profileDraftForCharacter } from "../lib/character-profile-drafts";
import { emptyCharacterProfile } from "../lib/brain-defaults";
import type { Character } from "../lib/domain";
import { repository } from "../lib/repository";
import { db } from "../lib/db";
import { characterDirectorService } from "../lib/character-director";

const names = ["Valeria", "Ms Juicy", "Tiona", "Ms Orlando", "Nyra", "Unnamed Character"];

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
      expect(draft!.profile.ageVerifiedAdult).toBe(false);
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

  it("keeps age verification separate from assistant edits", () => {
    const draft = profileDraftForCharacter({ id: "qa-juicy", name: "Ms Juicy" })!;
    const edited = adjustProfileWithAssistant(draft.profile, "seductive");
    expect(edited.ageVerifiedAdult).toBe(false);
    expect(edited.conversationalProfile.flirtIntensity).toBeGreaterThan(draft.profile.conversationalProfile.flirtIntensity);
    expect(profileDraftForCharacter({ id: "qa-unnamed", name: "Unnamed Character" })?.profile.conversationalProfile.seductionStyle).toContain("Cute-but-dangerous");
  });

  it("records age verification only through the explicit confirmation method", () => {
    const character = repository.createCharacter(`Age QA ${Date.now()}`);
    const draft = profileDraftForCharacter({ id: character.id, name: "Valeria" })!;
    repository.applyCharacterProfileDraft(character.id, draft.characterPatch, draft.profile);
    expect(repository.characterProfile(character.id)?.ageVerifiedAdult).toBe(false);
    expect(() => repository.recordAdultAgeVerification(character.id, false)).toThrow(/confirmation/i);
    const verified = repository.recordAdultAgeVerification(character.id, true);
    expect(verified.ageVerifiedAdult).toBe(true);
    expect(db.prepare("SELECT detailJson FROM activationAudit WHERE event='adult-age-verified' AND detailJson LIKE ?").all(`%${character.id}%`)).toHaveLength(1);
    db.prepare("DELETE FROM activationAudit WHERE event='adult-age-verified' AND detailJson LIKE ?").run(`%${character.id}%`);
    db.prepare("DELETE FROM messages WHERE conversationId=(SELECT id FROM conversations WHERE characterId=?)").run(character.id);
    db.prepare("DELETE FROM conversations WHERE characterId=?").run(character.id);
    db.prepare("DELETE FROM characterBrainProfiles WHERE characterId=?").run(character.id);
    db.prepare("DELETE FROM creativeMemories WHERE characterId=?").run(character.id);
    db.prepare("DELETE FROM initiativeStates WHERE characterId=?").run(character.id);
    db.prepare("DELETE FROM characters WHERE id=?").run(character.id);
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
