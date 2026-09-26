import fs from "node:fs";
import path from "node:path";
import { db } from "../lib/db";
import { repository } from "../lib/repository";

const backupPath = process.env.M6_3_DATABASE_BACKUP;
if (!backupPath || !fs.existsSync(backupPath) || fs.statSync(backupPath).size < 1024) {
  throw new Error("Set M6_3_DATABASE_BACKUP to the verified timestamped SQLite backup before running roster reconciliation.");
}
const expectedBackupDir = path.resolve(process.cwd(), ".artifacts/db-backups");
if (!path.resolve(backupPath).startsWith(expectedBackupDir + path.sep)) {
  throw new Error("Refusing to reconcile without a backup inside .artifacts/db-backups.");
}

const targets = ["Valeria", "Ms Juicy", "Tiona", "Ms Orlando", "Nyra", "Asian Character"];
const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\.+/g, "");
const report: { archived: { id: string; name: string; mediaPreserved: number }[]; created: string[]; preserved: string[] } = { archived: [], created: [], preserved: [] };

db.exec("BEGIN IMMEDIATE");
try {
  for (const [id, expectedName] of [["char-mara", "Mara Sol"], ["char-nova", "Nova Vale"]] as const) {
    const row = db.prepare("SELECT id,name,archived FROM characters WHERE id=?").get(id) as { id: string; name: string; archived: number } | undefined;
    if (!row || row.name !== expectedName) throw new Error(`Known demo ID ${id} did not match expected name ${expectedName}; no cleanup was guessed.`);
    const mediaPreserved = (db.prepare("SELECT COUNT(*) AS count FROM media WHERE characterId=?").get(id) as { count: number }).count;
    if (!row.archived) db.prepare("UPDATE characters SET archived=1 WHERE id=?").run(id);
    report.archived.push({ id, name: row.name, mediaPreserved });
  }

  for (const name of targets) {
    const matching = db.prepare("SELECT id,name,archived FROM characters WHERE lower(trim(name))=lower(trim(?)) ORDER BY createdAt").all(name) as { id: string; name: string; archived: number }[];
    const normalizedMatches = matching.filter((row) => normalize(row.name) === normalize(name));
    if (normalizedMatches.length > 1) throw new Error(`Multiple character records match ${name}; refusing to merge or choose automatically.`);
    if (normalizedMatches.length === 1) {
      const existing = normalizedMatches[0];
      if (existing.archived) db.prepare("UPDATE characters SET archived=0 WHERE id=?").run(existing.id);
      report.preserved.push(`${existing.name} (${existing.id})`);
    } else {
      const character = repository.createCharacter(name);
      report.created.push(`${character.name} (${character.id})`);
    }
  }

  const unexpected = repository.characters().filter((character) => !targets.some((name) => normalize(name) === normalize(character.name)));
  if (unexpected.length) throw new Error(`Unexpected active characters remain; preserving them for review: ${unexpected.map((character) => `${character.name} (${character.id})`).join(", ")}`);
  const activeNames = repository.characters().map((character) => normalize(character.name)).sort();
  if (activeNames.join("|") !== targets.map(normalize).sort().join("|")) throw new Error(`Active roster mismatch: ${activeNames.join(", ")}`);
  for (const name of ["Tiona", "Ms Orlando", "Nyra", "Asian Character"]) {
    const character = repository.characters().find((item) => normalize(item.name) === normalize(name))!;
    if (character.portraitUrl || repository.mediaByCharacter(character.id).length !== 0) throw new Error(`New target ${name} unexpectedly has portrait or media.`);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

const archivedMedia = report.archived.map((item) => ({ ...item, mediaStillPresent: (db.prepare("SELECT COUNT(*) AS count FROM media WHERE characterId=?").get(item.id) as { count: number }).count }));
console.log(JSON.stringify({ activeRoster: repository.characters().map(({ id, name, portraitUrl }) => ({ id, name, portrait: Boolean(portraitUrl) })), archived: archivedMedia, created: report.created, preserved: report.preserved, backupPath }, null, 2));
