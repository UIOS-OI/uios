import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TraceEvent, TraceMeta, TraceOperation, TraceStatus } from "@uios/contracts";
import type { TraceSink } from "@uios/trace";

export type Migration = { version: number; name: string; sql: string };

/**
 * Ordered, append-only migrations. Never edit an applied migration; add a new version instead
 * (DECISIONS.md D-03). Later stages add resources, relations, memory, and conversations here.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "trace_events",
    sql: `
      CREATE TABLE trace_events (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        parent_id TEXT,
        tenant_id TEXT NOT NULL,
        project_id TEXT,
        agent_id TEXT,
        model_id TEXT,
        provider_id TEXT,
        operation TEXT NOT NULL,
        resource_urn TEXT,
        destination TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        meta TEXT NOT NULL,
        observer TEXT NOT NULL
      );
      CREATE INDEX trace_events_tenant_time ON trace_events(tenant_id, started_at DESC, id DESC);
      CREATE INDEX trace_events_tenant_trace ON trace_events(tenant_id, trace_id);
      CREATE INDEX trace_events_tenant_operation ON trace_events(tenant_id, operation, started_at DESC);
    `,
  },
];

export type StorePersistence = "file" | "memory";

export class IntelligenceStore {
  readonly db: DatabaseSync;
  readonly persistence: StorePersistence;
  readonly location: string;

  constructor(location: string) {
    this.location = location;
    this.persistence = location === ":memory:" ? "memory" : "file";
    if (this.persistence === "file") mkdirSync(dirname(location), { recursive: true });
    this.db = new DatabaseSync(location);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.migrate();
  }

  schemaVersion(): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number };
    return Number(row.version);
  }

  private migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    const current = this.schemaVersion();
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue;
      this.db.exec("BEGIN");
      try {
        this.db.exec(migration.sql);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(migration.version, migration.name, new Date().toISOString());
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw new Error(`Intelligence store migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  close(): void {
    this.db.close();
  }
}

export type TraceQuery = {
  tenantId: string;
  operations?: TraceOperation[];
  statuses?: TraceStatus[];
  agentId?: string;
  modelId?: string;
  projectId?: string;
  traceId?: string;
  observer?: string;
  since?: string;
  until?: string;
  /** Opaque cursor from a previous page (`nextCursor`). Pages go newest → oldest. */
  cursor?: string;
  limit?: number;
};

type TraceRow = {
  id: string; trace_id: string; parent_id: string | null; tenant_id: string; project_id: string | null; agent_id: string | null;
  model_id: string | null; provider_id: string | null; operation: string; resource_urn: string | null; destination: string | null;
  status: string; started_at: string; ended_at: string; duration_ms: number; meta: string; observer: string;
};

function fromRow(row: TraceRow): TraceEvent {
  return {
    id: row.id,
    traceId: row.trace_id,
    ...(row.parent_id ? { parentId: row.parent_id } : {}),
    tenantId: row.tenant_id,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.model_id ? { modelId: row.model_id } : {}),
    ...(row.provider_id ? { providerId: row.provider_id } : {}),
    operation: row.operation as TraceOperation,
    ...(row.resource_urn ? { resourceUrn: row.resource_urn } : {}),
    ...(row.destination ? { destination: row.destination } : {}),
    status: row.status as TraceStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: Number(row.duration_ms),
    meta: JSON.parse(row.meta) as TraceMeta,
    observer: row.observer as TraceEvent["observer"],
  };
}

function encodeCursor(event: TraceEvent): string {
  return Buffer.from(JSON.stringify([event.startedAt, event.id])).toString("base64url");
}

function decodeCursor(cursor: string): [string, string] | null {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string") return [value[0], value[1]];
  } catch { /* fall through */ }
  return null;
}

export class SqliteTraceStore implements TraceSink {
  private readonly store: IntelligenceStore;
  private readonly insert;

  constructor(store: IntelligenceStore) {
    this.store = store;
    this.insert = store.db.prepare(`INSERT OR IGNORE INTO trace_events
      (id, trace_id, parent_id, tenant_id, project_id, agent_id, model_id, provider_id, operation, resource_urn, destination, status, started_at, ended_at, duration_ms, meta, observer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  }

  write(event: TraceEvent): void {
    this.insert.run(
      event.id, event.traceId, event.parentId ?? null, event.tenantId, event.projectId ?? null, event.agentId ?? null,
      event.modelId ?? null, event.providerId ?? null, event.operation, event.resourceUrn ?? null, event.destination ?? null,
      event.status, event.startedAt, event.endedAt, Math.round(event.durationMs), JSON.stringify(event.meta), event.observer,
    );
  }

  get(tenantId: string, id: string): TraceEvent | undefined {
    const row = this.store.db.prepare("SELECT * FROM trace_events WHERE tenant_id = ? AND id = ?").get(tenantId, id) as TraceRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  /** Tenant-scoped query. `tenantId` is mandatory and always the first predicate. */
  query(query: TraceQuery): { events: TraceEvent[]; nextCursor?: string } {
    if (!query.tenantId) throw new Error("Trace queries require a tenant id.");
    const where: string[] = ["tenant_id = ?"];
    const params: Array<string | number> = [query.tenantId];
    const list = (column: string, values: string[] | undefined) => {
      if (!values?.length) return;
      where.push(`${column} IN (${values.map(() => "?").join(", ")})`);
      params.push(...values);
    };
    list("operation", query.operations);
    list("status", query.statuses);
    for (const [column, value] of [["agent_id", query.agentId], ["model_id", query.modelId], ["project_id", query.projectId], ["trace_id", query.traceId], ["observer", query.observer]] as const) {
      if (value) { where.push(`${column} = ?`); params.push(value); }
    }
    if (query.since) { where.push("started_at >= ?"); params.push(query.since); }
    if (query.until) { where.push("started_at <= ?"); params.push(query.until); }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (!cursor) throw new Error("Invalid trace cursor.");
      where.push("(started_at < ? OR (started_at = ? AND id < ?))");
      params.push(cursor[0], cursor[0], cursor[1]);
    }
    const limit = Math.min(Math.max(Math.floor(query.limit ?? 100), 1), 500);
    params.push(limit + 1);
    const rows = this.store.db.prepare(`SELECT * FROM trace_events WHERE ${where.join(" AND ")} ORDER BY started_at DESC, id DESC LIMIT ?`).all(...params) as TraceRow[];
    const events = rows.slice(0, limit).map(fromRow);
    return { events, ...(rows.length > limit ? { nextCursor: encodeCursor(events[events.length - 1]) } : {}) };
  }

  count(tenantId: string): number {
    const row = this.store.db.prepare("SELECT COUNT(*) AS n FROM trace_events WHERE tenant_id = ?").get(tenantId) as { n: number };
    return Number(row.n);
  }

  /** Deletes events older than the retention window. Returns rows removed. */
  prune(retentionDays: number, now = Date.now()): number {
    const cutoff = new Date(now - retentionDays * 86_400_000).toISOString();
    const result = this.store.db.prepare("DELETE FROM trace_events WHERE started_at < ?").run(cutoff);
    return Number(result.changes);
  }

  deleteTenant(tenantId: string): number {
    return Number(this.store.db.prepare("DELETE FROM trace_events WHERE tenant_id = ?").run(tenantId).changes);
  }
}
