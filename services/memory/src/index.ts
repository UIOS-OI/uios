import { randomUUID } from "node:crypto";
import type { MemoryRecord } from "@uios/contracts";

export type MemoryPersistence = {
  save(record: MemoryRecord): Promise<void> | void;
  list(): Promise<MemoryRecord[]> | MemoryRecord[];
};

export class MemoryStore {
  private static readonly maxCachedRecords = 100_000;
  private readonly records: MemoryRecord[] = [];
  private readonly persistence?: MemoryPersistence;
  private initPromise?: Promise<void>;

  constructor(persistence?: MemoryPersistence) {
    this.persistence = persistence;
    if (persistence) {
      this.initPromise = (async () => {
        try {
          const list = await persistence.list();
          this.records.push(...list.slice(-MemoryStore.maxCachedRecords));
        } catch (error) {
          console.error("[MemoryStore] Failed to load persistence data:", error);
        }
      })();
    }
  }

  async save(tenantId: string, content: string, metadata: Record<string, string> = {}): Promise<MemoryRecord> {
    if (this.initPromise) await this.initPromise;
    const record = { id: randomUUID(), tenantId, content, metadata, createdAt: new Date().toISOString() };
    this.records.push(record);
    if (this.records.length > MemoryStore.maxCachedRecords) {
      this.records.splice(0, this.records.length - MemoryStore.maxCachedRecords);
    }
    if (this.persistence) {
      await this.persistence.save(record);
    }
    return record;
  }

  async search(tenantId: string, query: string, limit = 10): Promise<MemoryRecord[]> {
    if (this.initPromise) await this.initPromise;
    const terms = new Set(query.toLowerCase().split(/\W+/).filter((term) => term.length > 2));
    return this.records
      .filter((record) => record.tenantId === tenantId)
      .map((record) => ({
        record,
        score: [...terms].filter((term) => record.content.toLowerCase().includes(term)).length,
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.min(Math.max(limit, 1), 50))
      .map(({ record }) => record);
  }

  async list(tenantId: string): Promise<MemoryRecord[]> {
    if (this.initPromise) await this.initPromise;
    return this.records.filter((record) => record.tenantId === tenantId);
  }

  async clear(tenantId: string): Promise<void> {
    if (this.initPromise) await this.initPromise;
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      if (this.records[index].tenantId === tenantId) {
        this.records.splice(index, 1);
      }
    }
  }
}

