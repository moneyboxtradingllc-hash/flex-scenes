CREATE TABLE characterBrainProfiles_next (
  characterId TEXT PRIMARY KEY,
  initiativeLevel TEXT NOT NULL DEFAULT 'REACTIVE' CHECK(initiativeLevel IN ('REACTIVE','CREATIVE','DIRECTOR')),
  adultCharacter INTEGER NOT NULL DEFAULT 0,
  ageVerifiedAdult INTEGER NOT NULL DEFAULT 0,
  conversationalProfileJson TEXT NOT NULL DEFAULT '{}',
  creativeProfileJson TEXT NOT NULL DEFAULT '{}',
  updatedAt TEXT NOT NULL,
  FOREIGN KEY(characterId) REFERENCES characters(id) ON DELETE CASCADE
);
INSERT INTO characterBrainProfiles_next SELECT characterId,initiativeLevel,adultCharacter,ageVerifiedAdult,conversationalProfileJson,creativeProfileJson,updatedAt FROM characterBrainProfiles;
DROP TABLE characterBrainProfiles;
ALTER TABLE characterBrainProfiles_next RENAME TO characterBrainProfiles;

CREATE TABLE creativeMemories_next (
  characterId TEXT PRIMARY KEY,
  payloadJson TEXT NOT NULL DEFAULT '{}',
  updatedAt TEXT NOT NULL,
  FOREIGN KEY(characterId) REFERENCES characters(id) ON DELETE CASCADE
);
INSERT INTO creativeMemories_next SELECT characterId,payloadJson,updatedAt FROM creativeMemories;
DROP TABLE creativeMemories;
ALTER TABLE creativeMemories_next RENAME TO creativeMemories;
