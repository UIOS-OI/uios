import { randomUUID } from "node:crypto";
import type { MemoryRecord } from "@uios/contracts";

export type MemoryPersistence = { save(record: MemoryRecord): void; list(): MemoryRecord[] };

export class MemoryStore {
  private static readonly maxCachedRecords = 100_000;
  private readonly records: MemoryRecord[] = [];
  private readonly persistence?: MemoryPersistence;

  constructor(persistence?: MemoryPersistence) { this.persistence = persistence; if (persistence) this.records.push(...persistence.list().slice(-MemoryStore.maxCachedRecords)); }

  save(tenantId: string, content: string, metadata: Record<string, string> = {}): MemoryRecord {
    const record = { id: randomUUID(), tenantId, content, metadata, createdAt: new Date().toISOString() };
    this.records.push(record);
    if (this.records.length > MemoryStore.maxCachedRecords) this.records.splice(0, this.records.length - MemoryStore.maxCachedRecords);
    this.persistence?.save(record);
    return record;
  }

  search(tenantId: string, query: string, limit = 10): MemoryRecord[] {
    const terms = new Set(query.toLowerCase().split(/\W+/).filter((term) => term.length > 2));
    return this.records.filter((record) => record.tenantId === tenantId).map((record) => ({ record, score: [...terms].filter((term) => record.content.toLowerCase().includes(term)).length })).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score).slice(0, Math.min(Math.max(limit, 1), 50)).map(({ record }) => record);
  }

  list(tenantId: string): MemoryRecord[] {
    return this.records.filter((record) => record.tenantId === tenantId);
  }

  clear(tenantId: string): void {
    for (let index = this.records.length - 1; index >= 0; index -= 1) if (this.records[index].tenantId === tenantId) this.records.splice(index, 1);
  }
}
