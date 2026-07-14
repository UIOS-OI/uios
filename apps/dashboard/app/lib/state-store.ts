import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { MemoryRecord } from "@uios/contracts";
import type { AnalyticsEvent } from "@uios/contracts";

export type StoredWorkspace = { id: string; name: string; plan: "builder" | "scale" | "enterprise"; createdAt: string };
export type ApiKeyRole = "owner" | "admin" | "developer" | "viewer";
export type StoredApiKey = { id: string; tenantId: string; name: string; role: ApiKeyRole; keyPrefix: string; keyHash: string; createdAt: string; lastUsedAt?: string; revokedAt?: string };
export type UsageEvent = { id: string; tenantId: string; units: number; kind: "model_request" | "workflow_run" | "tool_call"; recordedAt: string };
export type UsageState = { units: number; requests: number; updatedAt: string; lastEventId?: string };

type State = { workspaces: Record<string, StoredWorkspace>; apiKeys: Record<string, StoredApiKey>; usage: Record<string, UsageState>; usageEvents: Record<string, UsageEvent[]>; memories: Record<string, MemoryRecord[]>; analytics: Record<string, AnalyticsEvent[]> };

const file = process.env.UIOS_STATE_FILE;
// Next evaluates route modules in parallel during `next build`; never open or mutate
// a runtime persistence file while generating the build artifact.
const databaseFile = process.env.NEXT_PHASE === "phase-production-build" ? undefined : process.env.UIOS_STATE_DB;
const auditRetentionDays = Math.min(Math.max(Number(process.env.UIOS_AUDIT_RETENTION_DAYS ?? 365) || 365, 1), 3650);
const auditRetentionCutoff = () => new Date(Date.now() - auditRetentionDays * 24 * 60 * 60 * 1000).toISOString();
const sqlite = openDatabase(databaseFile);
let state: State = loadState();

function openDatabase(path: string | undefined): DatabaseSync | null {
  if (!path) return null;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const database = new DatabaseSync(path);
    database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'developer', key_prefix TEXT NOT NULL, key_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT);
    CREATE TABLE IF NOT EXISTS usage (tenant_id TEXT PRIMARY KEY, units INTEGER NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, last_event_id TEXT);
    CREATE TABLE IF NOT EXISTS usage_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, units INTEGER NOT NULL, kind TEXT NOT NULL, recorded_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS usage_events_tenant_idx ON usage_events(tenant_id, recorded_at);
    CREATE TABLE IF NOT EXISTS memory_records (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS memory_records_tenant_idx ON memory_records(tenant_id, created_at);
    CREATE TABLE IF NOT EXISTS analytics_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, properties TEXT NOT NULL, timestamp TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS analytics_events_tenant_idx ON analytics_events(tenant_id, timestamp);
  `);
    try { database.exec("ALTER TABLE api_keys ADD COLUMN revoked_at TEXT"); } catch { /* existing database already migrated */ }
    try { database.exec("ALTER TABLE api_keys ADD COLUMN role TEXT NOT NULL DEFAULT 'developer'"); } catch { /* existing database already migrated */ }
    const cutoff = auditRetentionCutoff();
    database.prepare("DELETE FROM analytics_events WHERE timestamp < ?").run(cutoff);
    database.prepare("DELETE FROM usage_events WHERE recorded_at < ?").run(cutoff);
    return database;
  } catch (error) {
    console.error("[UIOS] SQLite database failed to open — falling back to in-memory/JSON store:", error instanceof Error ? error.message : error);
    return null;
  }
}

function loadState(): State {
  if (!file) return { workspaces: {}, apiKeys: {}, usage: {}, usageEvents: {}, memories: {}, analytics: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<State>;
    const cutoff = auditRetentionCutoff();
    const usageEvents = Object.fromEntries(Object.entries(parsed.usageEvents ?? {}).map(([tenantId, events]) => [tenantId, (events ?? []).filter((event) => event.recordedAt >= cutoff)]));
    const analytics = Object.fromEntries(Object.entries(parsed.analytics ?? {}).map(([tenantId, events]) => [tenantId, (events ?? []).filter((event) => event.timestamp >= cutoff)]));
    return { workspaces: parsed.workspaces ?? {}, apiKeys: parsed.apiKeys ?? {}, usage: parsed.usage ?? {}, usageEvents, memories: parsed.memories ?? {}, analytics };
  } catch {
    return { workspaces: {}, apiKeys: {}, usage: {}, usageEvents: {}, memories: {}, analytics: {} };
  }
}

export function saveMemory(record: MemoryRecord): void {
  if (sqlite) { sqlite.prepare("INSERT OR REPLACE INTO memory_records (id, tenant_id, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)").run(record.id, record.tenantId, record.content, JSON.stringify(record.metadata), record.createdAt); return; }
  state.memories[record.tenantId] = [...(state.memories[record.tenantId] ?? []), record].slice(-10_000); persist();
}

export function listMemories(): MemoryRecord[] {
  if (sqlite) return (sqlite.prepare("SELECT id, tenant_id AS tenantId, content, metadata, created_at AS createdAt FROM memory_records ORDER BY created_at ASC").all() as Array<Omit<MemoryRecord, "metadata"> & { metadata: string }>).map((record) => ({ ...record, metadata: JSON.parse(record.metadata) as Record<string, string> }));
  return Object.values(state.memories).flat();
}

export function saveAnalyticsEvent(event: AnalyticsEvent): void {
  if (sqlite) { sqlite.prepare("INSERT OR REPLACE INTO analytics_events (id, tenant_id, name, properties, timestamp) VALUES (?, ?, ?, ?, ?)").run(event.id, event.tenantId, event.name, JSON.stringify(event.properties), event.timestamp); return; }
  state.analytics[event.tenantId] = [...(state.analytics[event.tenantId] ?? []), event].slice(-20_000); persist();
}

export function listAnalyticsEvents(): AnalyticsEvent[] {
  if (sqlite) return (sqlite.prepare("SELECT id, tenant_id AS tenantId, name, properties, timestamp FROM analytics_events ORDER BY timestamp ASC").all() as Array<Omit<AnalyticsEvent, "properties"> & { properties: string }>).map((event) => ({ ...event, properties: JSON.parse(event.properties) as AnalyticsEvent["properties"] }));
  return Object.values(state.analytics).flat();
}

function persist() {
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.error("[UIOS] State persistence write failed:", error instanceof Error ? error.message : error);
  }
}

export function saveWorkspace(workspace: StoredWorkspace): StoredWorkspace {
  if (sqlite) {
    sqlite.prepare("INSERT INTO workspaces (id, name, plan, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, plan=excluded.plan").run(workspace.id, workspace.name, workspace.plan, workspace.createdAt);
    return workspace;
  }
  state.workspaces[workspace.id] = workspace;
  persist();
  return workspace;
}

export function findWorkspace(id: string): StoredWorkspace | undefined {
  if (sqlite) {
    const row = sqlite.prepare("SELECT id, name, plan, created_at AS createdAt FROM workspaces WHERE id = ?").get(id) as StoredWorkspace | undefined;
    return row;
  }
  return state.workspaces[id];
}

export function updateWorkspacePlan(id: string, plan: StoredWorkspace["plan"]): StoredWorkspace | undefined {
  const existing = findWorkspace(id);
  if (!existing) return undefined;
  const updated = { ...existing, plan };
  return saveWorkspace(updated);
}

export function deleteWorkspaceData(tenantId: string): void {
  if (sqlite) {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      for (const table of ["api_keys", "usage_events", "usage", "memory_records", "analytics_events", "workspaces"]) sqlite.prepare(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "tenant_id"} = ?`).run(tenantId);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  delete state.workspaces[tenantId];
  for (const key of Object.keys(state.apiKeys)) if (state.apiKeys[key].tenantId === tenantId) delete state.apiKeys[key];
  delete state.usage[tenantId]; delete state.usageEvents[tenantId]; delete state.memories[tenantId]; delete state.analytics[tenantId]; persist();
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function saveApiKey(key: StoredApiKey): StoredApiKey {
  if (sqlite) {
    sqlite.prepare("INSERT INTO api_keys (id, tenant_id, name, role, key_prefix, key_hash, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(key.id, key.tenantId, key.name, key.role, key.keyPrefix, key.keyHash, key.createdAt, key.lastUsedAt ?? null, key.revokedAt ?? null);
    return key;
  }
  state.apiKeys[key.id] = key;
  persist();
  return key;
}

export function listApiKeys(tenantId: string): Array<Omit<StoredApiKey, "keyHash">> {
  if (sqlite) return sqlite.prepare("SELECT id, tenant_id AS tenantId, name, role, key_prefix AS keyPrefix, created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId) as Array<Omit<StoredApiKey, "keyHash">>;
  return Object.values(state.apiKeys).filter((key) => key.tenantId === tenantId).map(({ keyHash: _keyHash, ...publicKey }) => ({ ...publicKey, role: publicKey.role ?? "developer" }));
}

export function getApiKeyRole(tenantId: string, id: string): ApiKeyRole | undefined {
  if (sqlite) {
    const row = sqlite.prepare("SELECT role FROM api_keys WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL").get(tenantId, id) as { role?: ApiKeyRole } | undefined;
    return row?.role;
  }
  const key = state.apiKeys[id];
  return key?.tenantId === tenantId && !key.revokedAt ? (key.role ?? "developer") : undefined;
}

export function revokeApiKey(tenantId: string, id: string): boolean {
  const revokedAt = new Date().toISOString();
  if (sqlite) return sqlite.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL").run(revokedAt, id, tenantId).changes > 0;
  const key = state.apiKeys[id];
  if (!key || key.tenantId !== tenantId || key.revokedAt) return false;
  key.revokedAt = revokedAt; persist(); return true;
}

export function resolveApiKey(rawKey: string): string | undefined {
  return resolveApiKeyAuth(rawKey)?.tenantId;
}

export function resolveApiKeyAuth(rawKey: string): { tenantId: string; role: ApiKeyRole } | undefined {
  const keyHash = hashApiKey(rawKey);
  if (sqlite) {
    const row = sqlite.prepare("SELECT id, tenant_id AS tenantId, role FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL").get(keyHash) as { id: string; tenantId: string; role: ApiKeyRole } | undefined;
    if (!row) return undefined;
    sqlite.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
    return { tenantId: row.tenantId, role: row.role };
  }
  const key = Object.values(state.apiKeys).find((candidate) => candidate.keyHash === keyHash && !candidate.revokedAt);
  if (!key) return undefined;
  key.lastUsedAt = new Date().toISOString();
  persist();
  return { tenantId: key.tenantId, role: key.role ?? "developer" };
}

export function recordUsage(tenantId: string, units: number, kind: UsageEvent["kind"] = "model_request"): UsageState {
  if (sqlite) {
    const event: UsageEvent = { id: randomUUID(), tenantId, units, kind, recordedAt: new Date().toISOString() };
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const current = sqlite.prepare("SELECT units, requests FROM usage WHERE tenant_id = ?").get(tenantId) as { units: number; requests: number } | undefined;
      const next = { units: (current?.units ?? 0) + units, requests: (current?.requests ?? 0) + 1, updatedAt: event.recordedAt, lastEventId: event.id };
      sqlite.prepare("INSERT INTO usage (tenant_id, units, requests, updated_at, last_event_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET units=excluded.units, requests=excluded.requests, updated_at=excluded.updated_at, last_event_id=excluded.last_event_id").run(tenantId, next.units, next.requests, next.updatedAt, next.lastEventId);
      sqlite.prepare("INSERT INTO usage_events (id, tenant_id, units, kind, recorded_at) VALUES (?, ?, ?, ?, ?)").run(event.id, tenantId, units, event.kind, event.recordedAt);
      sqlite.exec("COMMIT");
      return next;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  const current = state.usage[tenantId] ?? { units: 0, requests: 0, updatedAt: new Date().toISOString() };
  const event: UsageEvent = { id: randomUUID(), tenantId, units, kind, recordedAt: new Date().toISOString() };
  const next = { units: current.units + units, requests: current.requests + 1, updatedAt: event.recordedAt, lastEventId: event.id };
  state.usage[tenantId] = next;
  state.usageEvents[tenantId] = [...(state.usageEvents[tenantId] ?? []), event].slice(-1000);
  persist();
  return next;
}

export function getUsage(tenantId: string): UsageState {
  if (sqlite) {
    const row = sqlite.prepare("SELECT units, requests, updated_at AS updatedAt, last_event_id AS lastEventId FROM usage WHERE tenant_id = ?").get(tenantId) as UsageState | undefined;
    return row ?? { units: 0, requests: 0, updatedAt: new Date().toISOString() };
  }
  return state.usage[tenantId] ?? { units: 0, requests: 0, updatedAt: new Date().toISOString() };
}

export function listUsageEvents(tenantId: string, limit = 50): UsageEvent[] {
  if (sqlite) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    return sqlite.prepare("SELECT id, tenant_id AS tenantId, units, kind, recorded_at AS recordedAt FROM usage_events WHERE tenant_id = ? ORDER BY recorded_at DESC LIMIT ?").all(tenantId, safeLimit) as UsageEvent[];
  }
  return (state.usageEvents[tenantId] ?? []).slice(-Math.min(Math.max(limit, 1), 100)).reverse();
}
