import { randomUUID } from "node:crypto";
import type { AnalyticsEvent } from "@uios/contracts";

export type AnalyticsPersistence = {
  save(event: AnalyticsEvent): Promise<void> | void;
  list(): Promise<AnalyticsEvent[]> | AnalyticsEvent[];
};

export class AnalyticsCollector {
  private static readonly maxCachedEvents = 100_000;
  private readonly events: AnalyticsEvent[] = [];
  private readonly persistence?: AnalyticsPersistence;
  private initPromise?: Promise<void>;

  constructor(persistence?: AnalyticsPersistence) {
    this.persistence = persistence;
    if (persistence) {
      this.initPromise = (async () => {
        try {
          const list = await persistence.list();
          this.events.push(...list.slice(-AnalyticsCollector.maxCachedEvents));
        } catch (error) {
          console.error("[AnalyticsCollector] Failed to load persistence data:", error);
        }
      })();
    }
  }

  async refresh(): Promise<void> {
    if (!this.persistence) return;
    const list = await this.persistence.list();
    this.events.splice(0, this.events.length, ...list.slice(-AnalyticsCollector.maxCachedEvents));
  }

  async track(tenantId: string, name: string, properties: AnalyticsEvent["properties"] = {}): Promise<AnalyticsEvent> {
    if (this.initPromise) await this.initPromise;
    const event = { id: randomUUID(), tenantId, name, properties, timestamp: new Date().toISOString() };
    this.events.push(event);
    if (this.events.length > AnalyticsCollector.maxCachedEvents) {
      this.events.splice(0, this.events.length - AnalyticsCollector.maxCachedEvents);
    }
    if (this.persistence) {
      await this.persistence.save(event);
    }
    return event;
  }

  async summary(tenantId: string): Promise<Record<string, number>> {
    if (this.initPromise) await this.initPromise;
    return this.events
      .filter((event) => event.tenantId === tenantId)
      .reduce<Record<string, number>>((counts, event) => {
        counts[event.name] = (counts[event.name] ?? 0) + 1;
        return counts;
      }, {});
  }

  async recent(tenantId: string, limit = 50): Promise<AnalyticsEvent[]> {
    if (this.initPromise) await this.initPromise;
    return this.events
      .filter((event) => event.tenantId === tenantId)
      .slice(-Math.min(Math.max(limit, 1), 100))
      .reverse();
  }

  async clear(tenantId: string): Promise<void> {
    if (this.initPromise) await this.initPromise;
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      if (this.events[index].tenantId === tenantId) {
        this.events.splice(index, 1);
      }
    }
  }
}

