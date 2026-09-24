CREATE TABLE IF NOT EXISTS characterBrainProfiles (
  characterId TEXT PRIMARY KEY,
  initiativeLevel TEXT NOT NULL DEFAULT 'REACTIVE' CHECK(initiativeLevel IN ('REACTIVE','CREATIVE','DIRECTOR')),
  adultCharacter INTEGER NOT NULL DEFAULT 0,
  ageVerifiedAdult INTEGER NOT NULL DEFAULT 0,
  conversationalProfileJson TEXT NOT NULL DEFAULT '{}',
  creativeProfileJson TEXT NOT NULL DEFAULT '{}',
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS creativeMemories (
  characterId TEXT PRIMARY KEY,
  payloadJson TEXT NOT NULL DEFAULT '{}',
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sceneProposals (
  id TEXT PRIMARY KEY,
  parentProposalId TEXT,
  characterId TEXT NOT NULL,
  conversationId TEXT NOT NULL,
  title TEXT NOT NULL,
  naturalLanguagePitch TEXT NOT NULL,
  concept TEXT NOT NULL,
  location TEXT NOT NULL,
  wardrobe TEXT NOT NULL,
  mood TEXT NOT NULL,
  lighting TEXT NOT NULL,
  shotDescription TEXT NOT NULL,
  cameraDirection TEXT NOT NULL,
  imageOrVideoIntent TEXT NOT NULL CHECK(imageOrVideoIntent IN ('image','video')),
  suggestedAspectRatio TEXT NOT NULL,
  suggestedDuration INTEGER,
  suggestedReferenceIdsJson TEXT NOT NULL DEFAULT '[]',
  suggestedReferenceRolesJson TEXT NOT NULL DEFAULT '{}',
  proposedImagePlan TEXT NOT NULL,
  proposedVideoPlan TEXT NOT NULL,
  noveltyReason TEXT NOT NULL,
  sourceMessageIdsJson TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('DRAFT','PROPOSED','SAVED','ACCEPTED','REJECTED','REMIXED','GENERATED')),
  proposalSource TEXT NOT NULL CHECK(proposalSource IN ('conversation','proactive','remix')),
  noveltyScore REAL NOT NULL DEFAULT 1,
  similarityScore REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY(parentProposalId) REFERENCES sceneProposals(id),
  FOREIGN KEY(characterId) REFERENCES characters(id),
  FOREIGN KEY(conversationId) REFERENCES conversations(id)
);
CREATE INDEX IF NOT EXISTS idx_sceneProposals_character_status ON sceneProposals(characterId,status,updatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_sceneProposals_conversation ON sceneProposals(conversationId,createdAt);

CREATE TABLE IF NOT EXISTS proposalReferences (
  proposalId TEXT NOT NULL,
  mediaId TEXT NOT NULL,
  role TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY(proposalId,mediaId),
  FOREIGN KEY(proposalId) REFERENCES sceneProposals(id) ON DELETE CASCADE,
  FOREIGN KEY(mediaId) REFERENCES media(id)
);

CREATE TABLE IF NOT EXISTS conversationSummaries (
  conversationId TEXT PRIMARY KEY,
  summary TEXT NOT NULL DEFAULT '',
  summarizedThroughMessageId TEXT,
  summarizedAt TEXT,
  pinnedFactsJson TEXT NOT NULL DEFAULT '[]',
  recentUnsummarizedMessageIdsJson TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY(conversationId) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS pinnedMemories (
  id TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL,
  category TEXT NOT NULL,
  body TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY(conversationId) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pinnedMemories_conversation ON pinnedMemories(conversationId,createdAt DESC);

CREATE TABLE IF NOT EXISTS initiativeStates (
  characterId TEXT PRIMARY KEY,
  lastEvaluatedAt TEXT,
  nextEligibleAt TEXT,
  lastProactiveProposalAt TEXT,
  dailyCount INTEGER NOT NULL DEFAULT 0,
  dailyCountDate TEXT,
  cooldownSeconds INTEGER NOT NULL DEFAULT 28800,
  maxPerDay INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(characterId) REFERENCES characters(id)
);

CREATE TABLE IF NOT EXISTS conversationProviderRegistry (
  providerId TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  connected INTEGER NOT NULL DEFAULT 0,
  capabilitiesJson TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chatUsageLedger (
  id TEXT PRIMARY KEY,
  providerId TEXT NOT NULL,
  model TEXT NOT NULL,
  characterId TEXT NOT NULL,
  conversationId TEXT NOT NULL,
  inputTokens INTEGER NOT NULL DEFAULT 0,
  outputTokens INTEGER NOT NULL DEFAULT 0,
  estimatedCost REAL NOT NULL DEFAULT 0,
  actualCost REAL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY(characterId) REFERENCES characters(id),
  FOREIGN KEY(conversationId) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS mediaReactions (
  mediaId TEXT PRIMARY KEY,
  proposalId TEXT,
  characterId TEXT NOT NULL,
  messageId TEXT NOT NULL,
  payloadJson TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY(mediaId) REFERENCES media(id),
  FOREIGN KEY(proposalId) REFERENCES sceneProposals(id),
  FOREIGN KEY(messageId) REFERENCES messages(id)
);
