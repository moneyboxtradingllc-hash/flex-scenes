import { db } from "./db";
import { emptyCharacterProfile, emptyCreativeMemory } from "./brain-defaults";

/** Initialize required runtime rows without creating user-facing demo content. */
export function seedDatabase() {
  ensureCharacterSystemState();
}

function ensureCharacterSystemState() {
  const now = new Date().toISOString();
  const characters = db.prepare("SELECT id FROM characters").all() as { id: string }[];
  for (const { id } of characters) {
    const profile = emptyCharacterProfile(id);
    db.prepare("INSERT OR IGNORE INTO characterBrainProfiles(characterId,initiativeLevel,adultCharacter,ageVerifiedAdult,conversationalProfileJson,creativeProfileJson,updatedAt) VALUES(?,?,?,?,?,?,?)")
      .run(id, profile.initiativeLevel, 0, 0, JSON.stringify(profile.conversationalProfile), JSON.stringify(profile.creativeProfile), now);
    db.prepare("INSERT OR IGNORE INTO creativeMemories VALUES(?,?,?)").run(id, JSON.stringify(emptyCreativeMemory(id)), now);
    db.prepare("INSERT OR IGNORE INTO initiativeStates(characterId,cooldownSeconds,maxPerDay) VALUES(?,28800,1)").run(id);
  }
  db.prepare("INSERT OR IGNORE INTO conversationProviderRegistry(providerId,model,connected,capabilitiesJson,updatedAt) VALUES(?,?,?,?,?)")
    .run("mock-character-brain", "mock-character-brain-v1", 1, JSON.stringify({ textConversation: true, structuredOutput: true, contextWindow: null, streaming: true, toolCalling: false, adultRoleplay: "not_supported", estimatedInputCostPerMillion: 0, estimatedOutputCostPerMillion: 0 }), now);
}
