import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { MemoryRecord } from "@uios/contracts";
import type { AnalyticsEvent } from "@uios/contracts";
import { Pool } from "pg";
import pgvector from "pgvector";

export type StoredWorkspace = { id: string; name: string; plan: "builder" | "scale" | "enterprise"; createdAt: string };
export type ApiKeyRole = "owner" | "admin" | "developer" | "viewer";
export type StoredApiKey = { id: string; tenantId: string; name: string; role: ApiKeyRole; keyPrefix: string; keyHash: string; createdAt: string; lastUsedAt?: string; revokedAt?: string };
export type UsageEvent = { id: string; tenantId: string; units: number; kind: "model_request" | "workflow_run" | "tool_call"; recordedAt: string };
export type UsageState = { units: number; requests: number; updatedAt: string; lastEventId?: string };

type State = { workspaces: Record<string, StoredWorkspace>; apiKeys: Record<string, StoredApiKey>; usage: Record<string, UsageState>; usageEvents: Record<string, UsageEvent[]>; memories: Record<string, MemoryRecord[]>; analytics: Record<string, AnalyticsEvent[]> };

const file = process.env.UIOS_STATE_FILE;
const databaseFile = process.env.NEXT_PHASE === "phase-production-build" ? undefined : process.env.UIOS_STATE_DB;
const auditRetentionDays = Math.min(Math.max(Number(process.env.UIOS_AUDIT_RETENTION_DAYS ?? 365) || 365, 1), 3650);
const auditRetentionCutoff = () => new Date(Date.now() - auditRetentionDays * 24 * 60 * 60 * 1000).toISOString();

// PostgreSQL Connection configuration
const databaseUrl = process.env.NEXT_PHASE === "phase-production-build" ? undefined : (process.env.DATABASE_URL || process.env.UIOS_STATE_DB);
const isPostgres = !!(databaseUrl && (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")));

const pool = isPostgres ? new Pool({ connectionString: databaseUrl }) : null;
const sqlite = isPostgres ? null : openDatabase(databaseFile);
let state: State = isPostgres ? { workspaces: {}, apiKeys: {}, usage: {}, usageEvents: {}, memories: {}, analytics: {} } : loadState();

let initPromise: Promise<void> | null = null;

async function ensureDbInitialized(): Promise<void> {
  if (!pool) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");

      await pool.query(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          plan TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'developer',
          key_prefix TEXT NOT NULL,
          key_hash TEXT UNIQUE NOT NULL,
          created_at TEXT NOT NULL,
          last_used_at TEXT,
          revoked_at TEXT
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS usage (
          tenant_id TEXT PRIMARY KEY,
          units INTEGER NOT NULL DEFAULT 0,
          requests INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          last_event_id TEXT
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS usage_events (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          units INTEGER NOT NULL,
          kind TEXT NOT NULL,
          recorded_at TEXT NOT NULL
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS memory_records (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TEXT NOT NULL,
          embedding vector(1536)
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS analytics_events (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          name TEXT NOT NULL,
          properties JSONB NOT NULL DEFAULT '{}'::jsonb,
          timestamp TEXT NOT NULL
        );
      `);

      await pool.query("CREATE INDEX IF NOT EXISTS api_keys_tenant_id_idx ON api_keys(tenant_id);");
      await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);");
      await pool.query("CREATE INDEX IF NOT EXISTS usage_events_tenant_id_idx ON usage_events(tenant_id);");
      await pool.query("CREATE INDEX IF NOT EXISTS memory_records_tenant_id_idx ON memory_records(tenant_id);");
      await pool.query("CREATE INDEX IF NOT EXISTS analytics_events_tenant_id_idx ON analytics_events(tenant_id);");
      await pool.query("CREATE INDEX IF NOT EXISTS memory_records_embedding_hnsw_idx ON memory_records USING hnsw (embedding vector_cosine_ops);");

      const cutoff = auditRetentionCutoff();
      await pool.query("DELETE FROM analytics_events WHERE timestamp < $1", [cutoff]);
      await pool.query("DELETE FROM usage_events WHERE recorded_at < $1", [cutoff]);
    } catch (error) {
      console.error("[UIOS] PostgreSQL schema initialization failed:", error);
      throw error;
    }
  })();

  return initPromise;
}

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

function persist() {
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.error("[UIOS] State persistence write failed:", error instanceof Error ? error.message : error);
  }
}

export async function saveMemory(record: MemoryRecord): Promise<void> {
  if (pool) {
    await ensureDbInitialized();
    const metadata = JSON.stringify(record.metadata);
    const embedding = (record as any).embedding ? pgvector.toSql((record as any).embedding) : null;
    await pool.query(
      `INSERT INTO memory_records (id, tenant_id, content, metadata, created_at, embedding)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         content = EXCLUDED.content,
         metadata = EXCLUDED.metadata,
         created_at = EXCLUDED.created_at,
         embedding = EXCLUDED.embedding`,
      [record.id, record.tenantId, record.content, metadata, record.createdAt, embedding]
    );
    return;
  }
  if (sqlite) {
    sqlite.prepare("INSERT OR REPLACE INTO memory_records (id, tenant_id, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)").run(record.id, record.tenantId, record.content, JSON.stringify(record.metadata), record.createdAt);
    return;
  }
  state.memories[record.tenantId] = [...(state.memories[record.tenantId] ?? []), record].slice(-10_000);
  persist();
}

export async function listMemories(): Promise<MemoryRecord[]> {
  if (pool) {
    await ensureDbInitialized();
    const result = await pool.query(
      `SELECT id, tenant_id AS "tenantId", content, metadata, created_at AS "createdAt", embedding
       FROM memory_records
       ORDER BY created_at ASC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      content: row.content,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
      createdAt: row.createdAt,
      embedding: row.embedding ? (typeof row.embedding === "string" ? JSON.parse(row.embedding) : row.embedding) : undefined,
    }));
  }
  if (sqlite) {
    return (sqlite.prepare("SELECT id, tenant_id AS tenantId, content, metadata, created_at AS createdAt FROM memory_records ORDER BY created_at ASC").all() as Array<Omit<MemoryRecord, "metadata"> & { metadata: string }>).map((record) => ({ ...record, metadata: JSON.parse(record.metadata) as Record<string, string> }));
  }
  return Object.values(state.memories).flat();
}

export async function searchMemories(tenantId: string, embedding: number[], limit: number, queryText?: string): Promise<MemoryRecord[]> {
  if (pool) {
    await ensureDbInitialized();
    const result = await pool.query(
      `SELECT id, tenant_id AS "tenantId", content, metadata, created_at AS "createdAt", embedding
       FROM memory_records
       WHERE tenant_id = $1 AND embedding IS NOT NULL
       ORDER BY embedding <=> $2 ASC
       LIMIT $3`,
      [tenantId, pgvector.toSql(embedding), limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      content: row.content,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
      createdAt: row.createdAt,
      embedding: row.embedding ? (typeof row.embedding === "string" ? JSON.parse(row.embedding) : row.embedding) : undefined,
    }));
  }

  const text = queryText ?? "";
  const terms = new Set(text.toLowerCase().split(/\W+/).filter((term) => term.length > 2));
  
  let records: MemoryRecord[] = [];
  if (sqlite) {
    const rows = sqlite.prepare("SELECT id, tenant_id AS tenantId, content, metadata, created_at AS createdAt FROM memory_records WHERE tenant_id = ?").all(tenantId) as Array<Omit<MemoryRecord, "metadata"> & { metadata: string }>;
    records = rows.map((r) => ({ ...r, metadata: JSON.parse(r.metadata) }));
  } else {
    records = state.memories[tenantId] ?? [];
  }

  if (terms.size === 0) {
    return records.slice(-limit).reverse();
  }

  return records
    .map((record) => {
      const score = [...terms].filter((term) => record.content.toLowerCase().includes(term)).length;
      return { record, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ record }) => record);
}

export async function saveAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  if (pool) {
    await ensureDbInitialized();
    const properties = JSON.stringify(event.properties);
    await pool.query(
      `INSERT INTO analytics_events (id, tenant_id, name, properties, timestamp)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         name = EXCLUDED.name,
         properties = EXCLUDED.properties,
         timestamp = EXCLUDED.timestamp`,
      [event.id, event.tenantId, event.name, properties, event.timestamp]
    );
    return;
  }
  if (sqlite) {
    sqlite.prepare("INSERT OR REPLACE INTO analytics_events (id, tenant_id, name, properties, timestamp) VALUES (?, ?, ?, ?, ?)").run(event.id, event.tenantId, event.name, JSON.stringify(event.properties), event.timestamp);
    return;
  }
  state.analytics[event.tenantId] = [...(state.analytics[event.tenantId] ?? []), event].slice(-20_000);
  persist();
}

export async function listAnalyticsEvents(): Promise<AnalyticsEvent[]> {
  if (pool) {
    await ensureDbInitialized();
    const result = await pool.query(
      `SELECT id, tenant_id AS "tenantId", name, properties, timestamp
       FROM analytics_events
       ORDER BY timestamp ASC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      properties: typeof row.properties === "string" ? JSON.parse(row.properties) : row.properties,
      timestamp: row.timestamp,
    }));
  }
  if (sqlite) {
    return (sqlite.prepare("SELECT id, tenant_id AS tenantId, name, properties, timestamp FROM analytics_events ORDER BY timestamp ASC").all() as Array<Omit<AnalyticsEvent, "properties"> & { properties: string }>).map((event) => ({ ...event, properties: JSON.parse(event.properties) as AnalyticsEvent["properties"] }));
  }
  return Object.values(state.analytics).flat();
}

export async function saveWorkspace(workspace: StoredWorkspace): Promise<StoredWorkspace> {
  if (pool) {
    await ensureDbInitialized();
    await pool.query(
      `INSERT INTO workspaces (id, name, plan, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         plan = EXCLUDED.plan,
         created_at = EXCLUDED.created_at`,
      [workspace.id, workspace.name, workspace.plan, workspace.createdAt]
    );
    return workspace;
  }
  if (sqlite) {
    sqlite.prepare("INSERT INTO workspaces (id, name, plan, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, plan=excluded.plan").run(workspace.id, workspace.name, workspace.plan, workspace.createdAt);
    return workspace;
  }
  state.workspaces[workspace.id] = workspace;
  persist();
  return workspace;
}

export async function findWorkspace(id: string): Promise<StoredWorkspace | undefined> {
  if (pool) {
    await ensureDbInitialized();
    const result = await pool.query(
      `SELECT id, name, plan, created_at AS "createdAt"
       FROM workspaces
       WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  }
  if (sqlite) {
    const row = sqlite.prepare("SELECT id, name, plan, created_at AS createdAt FROM workspaces WHERE id = ?").get(id) as StoredWorkspace | undefined;
    return row;
  }
  return state.workspaces[id];
}

export async function updateWorkspacePlan(id: string, plan: StoredWorkspace["plan"]): Promise<StoredWorkspace | undefined> {
  const existing = await findWorkspace(id);
  if (!existing) return undefined;
  const updated = { ...existing, plan };
  return await saveWorkspace(updated);
}

export async function deleteWorkspaceData(tenantId: string): Promise<void> {
  if (pool) {
    await ensureDbInitialized();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const table of ["api_keys", "usage_events", "usage", "memory_records", "analytics_events"]) {
        await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
      }
      await client.query(`DELETE FROM workspaces WHERE id = $1`, [tenantId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }
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

export async function hashApiKey(rawKey: string): Promise<string> {
  return createHash("sha256").update(rawKey).digest("hex");
}

export async function saveApiKey(key: StoredApiKey): Promise<StoredApiKey> {
  if (pool) {
    await ensureDbInitialized();
    await pool.query(
      `INSERT INTO api_keys (id, tenant_id, name, role, key_prefix, key_hash, created_at, last_used_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [key.id, key.tenantId, key.name, key.role, key.keyPrefix, key.keyHash, key.createdAt, key.lastUsedAt ?? null, key.revokedAt ?? null]
    );
    return key;
  }
  if (sqlite) {
    sqlite.prepare("INSERT INTO api_keys (id, tenant_id, name, role, key_prefix, key_hash, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(key.id, key.tenantId, key.name, key.role, key.keyPrefix, key.keyHash, key.createdAt, key.lastUsedAt ?? null, key.revokedAt ?? null);
    return key;
  }
  state.apiKeys[key.id] = key;
  persist();
  return key;
}

export async function listApiKeys(tenantId: string): Promise<Array<Omit<StoredApiKey, "keyHash">>> {
  if (pool) {
    await ensureDbInitialized();
    const result = await pool.query(
      `SELECT id, tenant_id AS "tenantId", name, role, key_prefix AS "keyPrefix", created_at AS "createdAt", last_used_at AS "lastUsedAt", revoked_at AS "revokedAt"
       FROM api_keys
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows;
  }
  if (sqlite) return sqlite.prepare("SELECT id, tenant_id AS tenantId, name, role, key_prefix AS keyPrefix, created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId) as Array<Omit<StoredApiKey, "keyHash">>;
  return Object.values(state.apiKeys).filter((key) => key.tenantId === tenantId).map(({ keyHash: _keyHash, ...publicKey }) => ({ ...publicKey, role: publicKey.role ?? "developer" }));
}

export async function getApiKeyRole(tenantId: string, id: string): Promise<ApiKeyRole | undefined> {
  if (pool) {
    await ensureDbInitialized();
    const result = await pool.query(
      `SELECT role
       FROM api_keys
       WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL`,
      [tenantId, id]
    );
    return result.rows[0]?.role;
  }
  if (sqlite) {
    const row = sqlite.prepare("SELECT role FROM api_keys WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL").get(tenantId, id) as { role?: ApiKeyRole } | undefined;
    return row?.role;
  }
  const key = state.apiKeys[id];
  return key?.tenantId === tenantId && !key.revokedAt ? (key.role ?? "developer") : undefined;
}

export async function revokeApiKey(tenantId: string, id: string): Promise<boolean> {
  const revokedAt = new Date().toISOString();
  if (pool) {
    await ensureDbInitialized();
    const result = await pool.query(
      `UPDATE api_keys
       SET revoked_at = $1
       WHERE id = $2 AND tenant_id = $3 AND revoked_at IS NULL`,
      [revokedAt, id, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }
  if (sqlite) return sqlite.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL").run(revokedAt, id, tenantId).changes > 0;
  const key = state.apiKeys[id];
  if (!key || key.tenantId !== tenantId || key.revokedAt) return false;
  key.revokedAt = revokedAt; persist(); return true;
}

export async function resolveApiKey(rawKey: string): Promise<string | undefined> {
  const auth = await resolveApiKeyAuth(rawKey);
  return auth?.tenantId;
}

export async function resolveApiKeyAuth(rawKey: string): Promise<{ tenantId: string; role: ApiKeyRole } | undefined> {
  const keyHash = await hashApiKey(rawKey);
  if (pool) {
    await ensureDbInitialized();
    const result = await pool.query(
      `SELECT id, tenant_id AS "tenantId", role
       FROM api_keys
       WHERE key_hash = $1 AND revoked_at IS NULL`,
      [keyHash]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    await pool.query(
      `UPDATE api_keys
       SET last_used_at = $1
       WHERE id = $2`,
      [new Date().toISOString(), row.id]
    );
    return { tenantId: row.tenantId, role: row.role };
  }
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

export async function recordUsage(tenantId: string, units: number, kind: UsageEvent["kind"] = "model_request"): Promise<UsageState> {
  if (pool) {
    await ensureDbInitialized();
    const event: UsageEvent = { id: randomUUID(), tenantId, units, kind, recordedAt: new Date().toISOString() };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentRes = await client.query(
        `SELECT units, requests FROM usage WHERE tenant_id = $1`,
        [tenantId]
      );
      const current = currentRes.rows[0];
      const next = { units: (current?.units ?? 0) + units, requests: (current?.requests ?? 0) + 1, updatedAt: event.recordedAt, lastEventId: event.id };
      await client.query(
        `INSERT INTO usage (tenant_id, units, requests, updated_at, last_event_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id) DO UPDATE SET
           units = EXCLUDED.units,
           requests = EXCLUDED.requests,
           updated_at = EXCLUDED.updated_at,
           last_event_id = EXCLUDED.last_event_id`,
        [tenantId, next.units, next.requests, next.updatedAt, next.lastEventId]
      );
      await client.query(
        `INSERT INTO usage_events (id, tenant_id, units, kind, recorded_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [event.id, tenantId, units, event.kind, event.recordedAt]
      );
      await client.query("COMMIT");
      return next;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
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

export async function getUsage(tenantId: string): Promise<UsageState> {
  if (pool) {
    await ensureDbInitialized();
    const result = await pool.query(
      `SELECT units, requests, updated_at AS "updatedAt", last_event_id AS "lastEventId"
       FROM usage
       WHERE tenant_id = $1`,
      [tenantId]
    );
    const row = result.rows[0];
    return row ?? { units: 0, requests: 0, updatedAt: new Date().toISOString() };
  }
  if (sqlite) {
    const row = sqlite.prepare("SELECT units, requests, updated_at AS updatedAt, last_event_id AS lastEventId FROM usage WHERE tenant_id = ?").get(tenantId) as UsageState | undefined;
    return row ?? { units: 0, requests: 0, updatedAt: new Date().toISOString() };
  }
  return state.usage[tenantId] ?? { units: 0, requests: 0, updatedAt: new Date().toISOString() };
}

export async function listUsageEvents(tenantId: string, limit = 50): Promise<UsageEvent[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  if (pool) {
    await ensureDbInitialized();
    const result = await pool.query(
      `SELECT id, tenant_id AS "tenantId", units, kind, recorded_at AS "recordedAt"
       FROM usage_events
       WHERE tenant_id = $1
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [tenantId, safeLimit]
    );
    return result.rows;
  }
  if (sqlite) {
    return sqlite.prepare("SELECT id, tenant_id AS tenantId, units, kind, recorded_at AS recordedAt FROM usage_events WHERE tenant_id = ? ORDER BY recorded_at DESC LIMIT ?").all(tenantId, safeLimit) as UsageEvent[];
  }
  return (state.usageEvents[tenantId] ?? []).slice(-safeLimit).reverse();
}
