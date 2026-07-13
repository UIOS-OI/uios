import { randomUUID } from "node:crypto";
import type { AnalyticsEvent } from "@uios/contracts";

export type AnalyticsPersistence = { save(event: AnalyticsEvent): void; list(): AnalyticsEvent[] };

export class AnalyticsCollector {
  private static readonly maxCachedEvents = 100_000;
  private readonly events: AnalyticsEvent[] = [];
  private readonly persistence?: AnalyticsPersistence;

  constructor(persistence?: AnalyticsPersistence) { this.persistence = persistence; if (persistence) this.events.push(...persistence.list().slice(-AnalyticsCollector.maxCachedEvents)); }

  refresh(): void {
    if (!this.persistence) return;
    this.events.splice(0, this.events.length, ...this.persistence.list().slice(-AnalyticsCollector.maxCachedEvents));
  }

  track(tenantId: string, name: string, properties: AnalyticsEvent["properties"] = {}): AnalyticsEvent {
    const event = { id: randomUUID(), tenantId, name, properties, timestamp: new Date().toISOString() };
    this.events.push(event);
    if (this.events.length > AnalyticsCollector.maxCachedEvents) this.events.splice(0, this.events.length - AnalyticsCollector.maxCachedEvents);
    this.persistence?.save(event);
    return event;
  }

  summary(tenantId: string): Record<string, number> {
    return this.events.filter((event) => event.tenantId === tenantId).reduce<Record<string, number>>((counts, event) => { counts[event.name] = (counts[event.name] ?? 0) + 1; return counts; }, {});
  }

  recent(tenantId: string, limit = 50): AnalyticsEvent[] {
    return this.events.filter((event) => event.tenantId === tenantId).slice(-Math.min(Math.max(limit, 1), 100)).reverse();
  }

  clear(tenantId: string): void {
    for (let index = this.events.length - 1; index >= 0; index -= 1) if (this.events[index].tenantId === tenantId) this.events.splice(index, 1);
  }
}
