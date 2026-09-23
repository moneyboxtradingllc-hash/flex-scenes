import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "flex-scenes.db"));
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
export { db };
