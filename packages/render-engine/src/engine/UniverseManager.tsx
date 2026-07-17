"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";

export type UniverseRegionKind = "aegis" | "memory" | "router" | "agents" | "observatory" | "forge" | "marketplace" | "workspace" | "provider";
export type SpatialLevel = "system" | "planet" | "world" | "district" | "building" | "workspace" | "document" | "graph" | "network";

export type UniverseRegion = {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
  kind: UniverseRegionKind;
  level: SpatialLevel;
  parentId: string | null;
  position: [number, number, number];
  color: string;
  scale?: number;
  source: "structural" | "workspace";
  action?: "travel" | "open-document";
  documentPath?: string;
};

export type UniverseTopology = {
  regions: UniverseRegion[];
  providerCount: number;
  knowledgeCount: number;
  connected: boolean;
  childrenOf: (parentId: string | null) => UniverseRegion[];
  nodeById: (id: string | null) => UniverseRegion | undefined;
  pathTo: (id: string) => UniverseRegion[];
  absolutePositionOf: (id: string) => [number, number, number];
};

export type CelestialBody = {
  id: string;
  parentId: string | null;
  label: string;
  kind: "planet" | "moon" | "asteroid";
  description: string;
  size: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  orbitInclination: number;
  documentPath?: string;
  contentType: "file" | "folder" | "memory" | "document";
  addedAt: string;
  color: string;
};

export type GalaxyDescriptor = {
  id: string;
  label: string;
  color: string;
  position: [number, number, number];
  hostPlanet: {
    id: string;
    label: string;
    description: string;
    size: number;
  };
  bodies: CelestialBody[];
};

type GalaxyTopologyState = {
  galaxies: GalaxyDescriptor[];
  newArrivals: Set<string>;
};

const GalaxyContext = createContext<GalaxyTopologyState>({ galaxies: [], newArrivals: new Set() });

const SYSTEMS: Array<Omit<UniverseRegion, "level" | "parentId" | "source">> = [
  { id: "memory", label: "Memory Atmosphere", eyebrow: "Living knowledge galaxy", description: "A luminous intelligence atmosphere containing every authorized file, memory, blueprint, and knowledge world.", kind: "memory", color: "#d8fbff", position: [2880000, 896000, -5056000] },
  { id: "aegis", label: "Aegis System", eyebrow: "Security civilization", description: "A distant defensive system surrounding governed actions, policy, and approval evidence.", kind: "aegis", color: "#35c8ff", position: [-3456000, 704000, -6272000] },
  { id: "router", label: "Router System", eyebrow: "Intelligence interchange", description: "A high-energy transit system routing intent toward models, tools, agents, and workflows.", kind: "router", color: "#b675ff", position: [1472000, -1536000, -7488000] },
  { id: "agents", label: "Agent Nexus", eyebrow: "Autonomous civilization", description: "An active system of agents, tools, approvals, and durable execution paths.", kind: "agents", color: "#ff76c8", position: [-4416000, -1152000, -8640000] },
  { id: "observatory", label: "Observatory System", eyebrow: "System intelligence", description: "A remote evidence system where usage, performance, and activity become spatial signals.", kind: "observatory", color: "#6fd7ff", position: [4800000, 1792000, -9856000] },
  { id: "forge", label: "Forge System", eyebrow: "Construction civilization", description: "A stellar foundry where governed capabilities, workflows, and integrations assemble.", kind: "forge", color: "#ffb64f", position: [-1984000, 2688000, -10944000] },
  { id: "marketplace", label: "Marketplace System", eyebrow: "Capability exchange", description: "A distributed trade system for explicitly permitted tools and integrations.", kind: "marketplace", color: "#63f0ba", position: [4032000, -2496000, -12096000] },
];

const DEPARTMENTS = ["Policies", "Engineering", "Sales", "HR", "Finance", "Customer"];
const ENGINEERING_WORLDS = ["Repositories", "Projects", "Documentation", "Source Code", "Functions"];
const SYSTEM_PLANETS: Record<string, string[]> = {
  memory: DEPARTMENTS,
  aegis: ["Shield", "Identity", "Policy", "Audit", "Threat", "Approvals"],
  router: ["Providers", "Models", "Requests", "Traffic", "Tools", "Gateways"],
  agents: ["Swarms", "Tasks", "Workflows", "Collaboration", "Skills", "Runs"],
  observatory: ["Analytics", "Traces", "Usage", "Performance", "Evidence", "Events"],
  forge: ["Blueprints", "Integrations", "Workflows", "Templates", "Builds", "Releases"],
  marketplace: ["Providers", "Tools", "Agents", "Connectors", "Models", "Collections"],
};

function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function node(input: Partial<UniverseRegion> & Pick<UniverseRegion, "id" | "label" | "kind" | "level" | "parentId" | "position" | "color">): UniverseRegion {
  return { eyebrow: input.level, description: `${input.label} is a streamed ${input.level} inside the UIOS spatial hierarchy.`, source: "structural", ...input } as UniverseRegion;
}

function buildStructuralRegions(): UniverseRegion[] {
  const nodes: UniverseRegion[] = SYSTEMS.map((system) => node({ ...system, level: "system", parentId: null, source: "structural" }));
  for (const system of SYSTEMS) {
    const planetNames = SYSTEM_PLANETS[system.id] ?? [system.label.replace(" System", "")];
    planetNames.forEach((name, index) => {
      const planetId = `${system.id}-${slug(name)}-planet`;
      const spread = planetNames.length === 1 ? 0 : (index - (planetNames.length - 1) / 2) * 60000;
      nodes.push(node({ id: planetId, label: `${name} Planet`, kind: system.kind, level: "planet", parentId: system.id, color: system.color, position: [spread, Math.sin(index * 1.7) * 28000, -176000 - Math.abs(spread) * 0.1] }));
      const worlds = system.id === "memory" && name === "Engineering" ? ENGINEERING_WORLDS : [`${name} World`];
      worlds.forEach((worldName, worldIndex) => {
        const worldId = `${planetId}-${slug(worldName)}-world`;
        nodes.push(node({ id: worldId, label: worldName, kind: system.kind, level: "world", parentId: planetId, color: system.color, position: [(worldIndex - (worlds.length - 1) / 2) * 56000, Math.sin(worldIndex * 1.4) * 20000, -146000 - Math.abs(worldIndex - (worlds.length - 1) / 2) * 10000] }));
        const districtId = `${worldId}-district`;
        const buildingId = `${worldId}-building`;
        nodes.push(node({ id: districtId, label: `${worldName} District`, kind: system.kind, level: "district", parentId: worldId, color: system.color, position: [0, -18000, -124000] }));
        nodes.push(node({ id: buildingId, label: `${worldName} Archive`, kind: system.kind, level: "building", parentId: districtId, color: system.color, position: [32000, -11000, -112000] }));
        nodes.push(node({ id: `${worldId}-workspace`, label: `${worldName} Workspace`, kind: "workspace", level: "workspace", parentId: buildingId, color: "#8fffe0", position: [0, 0, -98000] }));
      });
    });
  }
  return nodes;
}

const STRUCTURAL_REGIONS = buildStructuralRegions();

function safeProviderId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/.test(value); }
function safeDocument(value: unknown): value is { path: string; title: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { path?: unknown; title?: unknown };
  return typeof candidate.path === "string" && /^(?:docs\/|[A-Z0-9_-]+\.md$)/i.test(candidate.path) && typeof candidate.title === "string" && candidate.title.length > 0 && candidate.title.length < 120;
}

type MemoryDepartment = "Policies" | "Engineering" | "Sales" | "HR" | "Finance" | "Customer";

const DOCUMENT_DEPARTMENT_RULES: ReadonlyArray<{ department: MemoryDepartment; keywords: readonly string[] }> = [
  { department: "Policies", keywords: ["compliance", "security", "governance", "incident", "checklist", "policy", "privacy", "terms"] },
  { department: "Finance", keywords: ["finance", "billing", "usage", "cost", "revenue", "pricing"] },
  { department: "HR", keywords: ["human-resources", "identity", "team", "people", "employee", "role"] },
  { department: "Sales", keywords: ["sales", "marketplace", "market", "product", "launch", "roadmap"] },
  { department: "Customer", keywords: ["customer", "user-journey", "user-interface", "experience", "support", "memory"] },
];

function documentDepartment(document: { path: string; title: string }): MemoryDepartment {
  const searchable = `${document.path} ${document.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return DOCUMENT_DEPARTMENT_RULES.find((rule) => rule.keywords.some((keyword) => searchable.includes(keyword)))?.department ?? "Engineering";
}

function documentRegion(document: { path: string; title: string }, index: number, total: number, department: MemoryDepartment): UniverseRegion {
  const columns = Math.max(4, Math.ceil(Math.sqrt(total)));
  const column = index % columns;
  const row = Math.floor(index / columns);
  return node({ id: `memory-document-${slug(document.path)}`, label: document.title, eyebrow: `${department} file`, description: `Open ${document.path} inside the UIOS Memory reader.`, kind: "memory", level: "document", parentId: `memory-${slug(department)}-planet`, color: index % 3 === 0 ? "#b7f4ff" : "#80a8ff", position: [(column - (columns - 1) / 2) * 36000, (row % 2 ? 1 : -1) * (26000 + row * 4800), -146000 - row * 28000], source: "structural", action: "open-document", documentPath: document.path });
}

function buildDocumentRegions(documents: Array<{ path: string; title: string }>): UniverseRegion[] {
  const buckets = new Map<MemoryDepartment, Array<{ path: string; title: string }>>();
  for (const document of documents) {
    const department = documentDepartment(document);
    const bucket = buckets.get(department) ?? [];
    bucket.push(document);
    buckets.set(department, bucket);
  }
  return [...buckets.entries()].flatMap(([department, files]) => files.map((document, index) => documentRegion(document, index, files.length, department)));
}

function providerRegion(id: string, index: number, total: number): UniverseRegion {
  const angle = index / Math.max(total, 1) * Math.PI * 2;
  return node({ id: `provider-${id}`, label: `${id} Provider World`, eyebrow: "Workspace provider", description: "A provider world registered through the authenticated UIOS plugin boundary.", kind: "provider", level: "planet", parentId: "router", color: index % 2 ? "#c58aff" : "#78a8ff", position: [Math.cos(angle) * 10800, Math.sin(angle * 2) * 1200, Math.sin(angle) * 10800], source: "workspace" });
}

const EMPTY: UniverseTopology = { regions: STRUCTURAL_REGIONS, providerCount: 0, knowledgeCount: 0, connected: false, childrenOf: () => [], nodeById: () => undefined, pathTo: () => [], absolutePositionOf: () => [0, 0, 0] };
const UniverseContext = createContext<UniverseTopology>(EMPTY);

export function UniverseManager({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<string[]>([]);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [documents, setDocuments] = useState<Array<{ path: string; title: string }>>([]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/universe/topology", { cache: "no-store", credentials: "same-origin", signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { connected?: boolean; documents?: unknown[]; knowledgeCount?: number; providers?: unknown[] };
      setProviders((payload.providers ?? []).filter(safeProviderId));
      setDocuments((payload.documents ?? []).filter(safeDocument));
      setKnowledgeCount(Math.max(0, Number(payload.knowledgeCount) || 0));
      setConnected(payload.connected === true);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const topology = useMemo<UniverseTopology>(() => {
    const regions = [...STRUCTURAL_REGIONS, ...providers.map((id, index) => providerRegion(id, index, providers.length)), ...buildDocumentRegions(documents)];
    const byId = new Map(regions.map((region) => [region.id, region]));
    const generated = new Map<string, UniverseRegion>();
    const nodeById = (id: string | null) => id ? byId.get(id) ?? generated.get(id) : undefined;
    const recursiveChildren = (parent: UniverseRegion): UniverseRegion[] => {
      const nextLevel: SpatialLevel = parent.level === "workspace" ? "document" : parent.level === "document" ? "graph" : "network";
      const nouns = nextLevel === "document" ? ["Brief", "Record", "Source", "Evidence"] : nextLevel === "graph" ? ["Concept", "Entity", "Relation", "Context"] : ["Signal", "Memory", "Token", "Inference"];
      return nouns.map((noun, index) => {
        const id = `${parent.id}--${nextLevel}-${index}`;
        const existing = generated.get(id);
        if (existing) return existing;
        const angle = index / nouns.length * Math.PI * 2 + 0.4;
        const child = node({ id, label: `${noun} ${nextLevel === "network" ? "Network" : nextLevel === "graph" ? "Graph" : "Document"}`, eyebrow: "Fractal intelligence", description: "A procedurally streamed universe repeating the Fabric of Intelligence at another semantic scale.", kind: parent.kind, level: nextLevel, parentId: parent.id, color: parent.color, position: [Math.cos(angle) * 82000, Math.sin(angle * 1.7) * 28000, -142000 + Math.sin(angle) * 52000], source: parent.source });
        generated.set(id, child);
        return child;
      });
    };
    const childrenOf = (parentId: string | null) => {
      const authored = regions.filter((region) => region.parentId === parentId);
      if (authored.length || parentId === null) return authored;
      const parent = nodeById(parentId);
      return parent && ["workspace", "document", "graph", "network"].includes(parent.level) ? recursiveChildren(parent) : [];
    };
    const pathTo = (id: string) => { const path: UniverseRegion[] = []; let current = nodeById(id); while (current) { path.unshift(current); current = nodeById(current.parentId); } return path; };
    const absolutePositionOf = (id: string): [number, number, number] => pathTo(id).reduce<[number, number, number]>((sum, region) => [sum[0] + region.position[0], sum[1] + region.position[1], sum[2] + region.position[2]], [0, 0, 0]);
    return { regions, providerCount: providers.length, knowledgeCount, connected, childrenOf, nodeById, pathTo, absolutePositionOf };
  }, [connected, documents, knowledgeCount, providers]);
  return <UniverseContext.Provider value={topology}>{children}</UniverseContext.Provider>;
}

export function useUniverseTopology() { return useContext(UniverseContext); }
export { STRUCTURAL_REGIONS };

function safeGalaxy(value: unknown): value is GalaxyDescriptor {
  if (!value || typeof value !== "object") return false;
  const g = value as Record<string, unknown>;
  return typeof g.id === "string" && typeof g.label === "string" && Array.isArray(g.bodies);
}

export function GalaxyManager({ children }: { children: ReactNode }) {
  const [galaxies, setGalaxies] = useState<GalaxyDescriptor[]>([]);
  const [newArrivals, setNewArrivals] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());

  const fetchGalaxies = () => {
    void fetch("/api/universe/topology", { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) return;
        const payload = await r.json() as { galaxies?: unknown[] };
        const parsed = (payload.galaxies ?? []).filter(safeGalaxy);
        const arrivals = new Set<string>();
        parsed.forEach((g) =>
          g.bodies.forEach((b) => {
            if (!knownIds.current.has(b.id)) {
              arrivals.add(b.id);
              knownIds.current.add(b.id);
            }
          }),
        );
        if (arrivals.size > 0) setNewArrivals(arrivals);
        setGalaxies(parsed);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    fetchGalaxies();
    const interval = setInterval(fetchGalaxies, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GalaxyContext.Provider value={{ galaxies, newArrivals }}>
      {children}
    </GalaxyContext.Provider>
  );
}

export function useGalaxyTopology() {
  return useContext(GalaxyContext);
}
