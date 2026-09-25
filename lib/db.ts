import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = process.env.FLEX_SCENES_QA_DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "flex-scenes.db"));
db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY,name TEXT,handle TEXT,portraitUrl TEXT,description TEXT,personality TEXT,identityNotes TEXT,defaultsJson TEXT,createdAt TEXT);
CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY,characterId TEXT,type TEXT,url TEXT,posterUrl TEXT,title TEXT,caption TEXT,prompt TEXT,providerId TEXT,settingsJson TEXT,parentId TEXT,isReference INTEGER,createdAt TEXT,favorite INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY,characterId TEXT,mode TEXT,prompt TEXT,status TEXT,providerId TEXT,settingsJson TEXT,parentMediaId TEXT,conversationId TEXT,createdAt TEXT,updatedAt TEXT,error TEXT,mediaId TEXT);
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY,characterId TEXT,updatedAt TEXT,unread INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY,conversationId TEXT,role TEXT,body TEXT,createdAt TEXT);
CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY,name TEXT);
CREATE TABLE IF NOT EXISTS collectionItems (collectionId TEXT,mediaId TEXT,PRIMARY KEY(collectionId,mediaId));
CREATE TABLE IF NOT EXISTS notes (mediaId TEXT PRIMARY KEY,body TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS characterReferences (characterId TEXT,mediaId TEXT,role TEXT,canonical INTEGER DEFAULT 0,createdAt TEXT,PRIMARY KEY(characterId,mediaId,role));
CREATE TABLE IF NOT EXISTS jobReferences (jobId TEXT,mediaId TEXT,role TEXT,position INTEGER,PRIMARY KEY(jobId,mediaId,role));`);
db.exec(`CREATE TABLE IF NOT EXISTS characterReferenceMeta (characterId TEXT,mediaId TEXT,role TEXT,label TEXT,notes TEXT,active INTEGER DEFAULT 1,priority INTEGER DEFAULT 0,PRIMARY KEY(characterId,mediaId,role));
CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY,characterId TEXT,mode TEXT,payloadJson TEXT,updatedAt TEXT);
CREATE TABLE IF NOT EXISTS usageLedger (id TEXT PRIMARY KEY,jobId TEXT,providerId TEXT,model TEXT,mediaType TEXT,estimatedCost REAL,actualCost REAL,usageJson TEXT,createdAt TEXT);
CREATE TABLE IF NOT EXISTS conversationMemory (conversationId TEXT PRIMARY KEY,summary TEXT,pinnedFacts TEXT,contextNotes TEXT,updatedAt TEXT);
CREATE TABLE IF NOT EXISTS messageAttachments (messageId TEXT,mediaId TEXT,kind TEXT,PRIMARY KEY(messageId,mediaId));
CREATE TABLE IF NOT EXISTS jobEvents (id TEXT PRIMARY KEY,jobId TEXT,channel TEXT,state TEXT,message TEXT,createdAt TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS providerSettings (provider TEXT PRIMARY KEY,enabled INTEGER DEFAULT 0,freeze INTEGER DEFAULT 0,dailyCap REAL,monthlyCap REAL,perGenerationCap REAL,updatedAt TEXT);
CREATE TABLE IF NOT EXISTS liveAuthorizations (id TEXT PRIMARY KEY,provider TEXT,deployment TEXT,requestHash TEXT,maxCost REAL,expiresAt TEXT,consumedAt TEXT);
CREATE TABLE IF NOT EXISTS providerAssets (mediaId TEXT,provider TEXT,providerAssetId TEXT,temporaryUrl TEXT,uploadedAt TEXT,expiresAt TEXT,cleanupStatus TEXT,PRIMARY KEY(mediaId,provider));
CREATE TABLE IF NOT EXISTS activationAudit (id TEXT PRIMARY KEY,event TEXT,detailJson TEXT,createdAt TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS runtimeSettings (key TEXT PRIMARY KEY,value TEXT,updatedAt TEXT);
CREATE TABLE IF NOT EXISTS submissionIntents (id TEXT PRIMARY KEY,jobId TEXT,authorizationId TEXT,provider TEXT,deployment TEXT,requestHash TEXT,idempotencyKey TEXT,state TEXT,providerTaskId TEXT,error TEXT,createdAt TEXT,updatedAt TEXT);`);
db.exec("CREATE TABLE IF NOT EXISTS schemaMigrations (version INTEGER PRIMARY KEY,name TEXT NOT NULL,appliedAt TEXT NOT NULL);");
for (const migration of [
  {version:1,name:"character-director-m1",file:"001_character_director.sql"},
  {version:2,name:"separate-creative-and-conversation-profiles",file:"002_separate_creative_and_conversation_profiles.sql"},
  {version:3,name:"character-brain-foreign-keys",file:"003_character_brain_foreign_keys.sql"},
]) {
  if (db.prepare("SELECT version FROM schemaMigrations WHERE version=?").get(migration.version)) continue;
  const sql = fs.readFileSync(path.join(process.cwd(), "lib", "migrations", migration.file), "utf8");
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.exec(sql);
    db.prepare("INSERT INTO schemaMigrations(version,name,appliedAt) VALUES(?,?,?)").run(migration.version,migration.name,new Date().toISOString());
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}
export { db };
