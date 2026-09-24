import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db";

export type ProviderName = "HotAPI" | "MuAPI" | "Siray";
export type LivePlan = { provider: ProviderName; deployment: string; request: unknown; estimate: number; videoReferenceSeconds?: number };
const now = () => new Date().toISOString();
const vaultPath = path.join(process.cwd(), "data", "provider-secrets.json");
export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
};
export const requestHash = (request: unknown) => createHash("sha256").update(stableStringify(request)).digest("hex");

/** Current-user Windows DPAPI vault; the encrypted artifact is deliberately outside SQLite. */
export class WindowsDpapiVault {
  private run(mode: "protect" | "unprotect", base64: string) {
    const script = `Add-Type -AssemblyName System.Security;$b=[Convert]::FromBase64String($env:FLEX_SCENE_SECRET);$s=[Security.Cryptography.DataProtectionScope]::CurrentUser;if('${mode}' -eq 'protect'){$o=[Security.Cryptography.ProtectedData]::Protect($b,$null,$s)}else{$o=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,$s)};[Console]::Write([Convert]::ToBase64String($o))`;
    const out = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { env: { ...process.env, FLEX_SCENE_SECRET: base64 } });
    if (out.status !== 0) throw new Error("Windows DPAPI operation failed.");
    return out.stdout.toString().trim();
  }
  store(provider: ProviderName, secret: string) {
    if (!secret.trim()) throw new Error("EMPTY_CREDENTIAL");
    fs.mkdirSync(path.dirname(vaultPath), { recursive: true });
    const data = fs.existsSync(vaultPath) ? JSON.parse(fs.readFileSync(vaultPath, "utf8")) : {};
    data[provider] = this.run("protect", Buffer.from(secret, "utf8").toString("base64"));
    fs.writeFileSync(vaultPath, JSON.stringify(data));
  }
  read(provider: ProviderName) {
    const data = fs.existsSync(vaultPath) ? JSON.parse(fs.readFileSync(vaultPath, "utf8")) : {};
    return data[provider] ? Buffer.from(this.run("unprotect", data[provider]), "base64").toString("utf8") : undefined;
  }
  remove(provider: ProviderName) { if (!fs.existsSync(vaultPath)) return; const data = JSON.parse(fs.readFileSync(vaultPath, "utf8")); delete data[provider]; fs.writeFileSync(vaultPath, JSON.stringify(data)); }
  fingerprint(provider: ProviderName) { const secret = this.read(provider); return secret ? `••••${createHash("sha256").update(secret).digest("hex").slice(-4).toUpperCase()}` : undefined; }
}
export const vault = new WindowsDpapiVault();
export function audit(event: string, detail: unknown) { db.prepare("INSERT INTO activationAudit VALUES(?,?,?,?)").run(randomUUID(), event, JSON.stringify(detail), now()); }

export class GenerationCostGovernor {
  settings(provider: ProviderName) {
    let row = db.prepare("SELECT * FROM providerSettings WHERE provider=?").get(provider) as Record<string, unknown> | undefined;
    if (!row) { db.prepare("INSERT INTO providerSettings VALUES(?,?,?,?,?,?,?)").run(provider, 0, 0, 1, 5, .25, now()); row = db.prepare("SELECT * FROM providerSettings WHERE provider=?").get(provider) as Record<string, unknown>; }
    return row! as { provider: ProviderName; enabled: number; freeze: number; dailyCap: number; monthlyCap: number; perGenerationCap: number; updatedAt: string };
  }
  set(provider: ProviderName, patch: { enabled?: boolean; freeze?: boolean; dailyCap?: number; monthlyCap?: number; perGenerationCap?: number }) {
    const s = { ...this.settings(provider), ...patch };
    db.prepare("UPDATE providerSettings SET enabled=?,freeze=?,dailyCap=?,monthlyCap=?,perGenerationCap=?,updatedAt=? WHERE provider=?").run(Number(s.enabled), Number(s.freeze), s.dailyCap, s.monthlyCap, s.perGenerationCap, now(), provider);
    audit(patch.freeze !== undefined ? "freeze-changed" : "provider-settings", { provider, patch }); return this.settings(provider);
  }
  isGlobalLiveEnabled() { return (db.prepare("SELECT value FROM runtimeSettings WHERE key='liveProvidersEnabled'").get() as { value: string } | undefined)?.value === "true"; }
  setGlobalLive(enabled: boolean) { db.prepare("INSERT INTO runtimeSettings(key,value,updatedAt) VALUES('liveProvidersEnabled',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt").run(String(enabled), now()); audit(enabled ? "live-global-enabled" : "live-global-disabled", {}); }
  authorize(plan: LivePlan) {
    const s = this.settings(plan.provider);
    if (!this.isGlobalLiveEnabled()) throw new Error("GLOBAL_LIVE_PROVIDERS_DISABLED");
    if (!s.enabled) throw new Error("LIVE_PROVIDERS_DISABLED"); if (s.freeze) throw new Error("PAID_GENERATION_FROZEN"); if (plan.estimate > s.perGenerationCap) throw new Error("PER_GENERATION_CAP");
    const spend = this.spend(plan.provider); if (spend.today + plan.estimate > s.dailyCap) throw new Error("DAILY_CAP"); if (spend.month + plan.estimate > s.monthlyCap) throw new Error("MONTHLY_CAP");
    const id = randomUUID(), hash = requestHash(plan.request); db.prepare("INSERT INTO liveAuthorizations VALUES(?,?,?,?,?,?,?)").run(id, plan.provider, plan.deployment, hash, plan.estimate, new Date(Date.now() + 10 * 60_000).toISOString(), null); audit("authorized", { id, provider: plan.provider, deployment: plan.deployment, estimate: plan.estimate }); return { id, hash, maxCost: plan.estimate };
  }
  consume(id: string, plan: LivePlan) { const row = db.prepare("SELECT * FROM liveAuthorizations WHERE id=?").get(id) as { requestHash: string; consumedAt: string | null; expiresAt: string; maxCost: number } | undefined; if (!row || row.consumedAt || row.expiresAt < now() || row.requestHash !== requestHash(plan.request) || plan.estimate > row.maxCost) throw new Error("INVALID_OR_CONSUMED_AUTHORIZATION"); db.prepare("UPDATE liveAuthorizations SET consumedAt=? WHERE id=?").run(now(), id); audit("authorization-consumed", { id }); }
  spend(provider: ProviderName) { const rows = db.prepare("SELECT estimatedCost,createdAt FROM usageLedger WHERE providerId=?").all(provider) as { estimatedCost: number; createdAt: string }[]; const d = new Date(); return { today: rows.filter(r => new Date(r.createdAt).toDateString() === d.toDateString()).reduce((x, r) => x + r.estimatedCost, 0), month: rows.filter(r => new Date(r.createdAt).getMonth() === d.getMonth() && new Date(r.createdAt).getFullYear() === d.getFullYear()).reduce((x, r) => x + r.estimatedCost, 0) }; }
}
export const governor = new GenerationCostGovernor();
