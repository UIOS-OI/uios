import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT_DOCUMENTS = ["README.md", "PROJECT.md", "SETUP.md", "SECURITY.md", "COMPLIANCE.md", "DATA_GOVERNANCE.md", "INCIDENT_RESPONSE.md", "LAUNCH_CHECKLIST.md"];
const REPO_ROOT = path.resolve(process.cwd(), "../..");

export type UniverseDocument = { path: string; title: string };

function titleFromPath(relativePath: string) {
  return path.basename(relativePath, path.extname(relativePath)).replace(/^\d+[_-]?/, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export async function listUniverseDocuments(): Promise<UniverseDocument[]> {
  const documents: UniverseDocument[] = ROOT_DOCUMENTS.map((relativePath) => ({ path: relativePath, title: titleFromPath(relativePath) }));
  const walk = async (directory: string, prefix: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relativePath);
      else if (entry.isFile() && /\.(md|txt)$/i.test(entry.name)) documents.push({ path: relativePath, title: titleFromPath(relativePath) });
    }
  };
  await walk(path.join(REPO_ROOT, "docs"), "docs");
  return documents.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readUniverseDocument(relativePath: string) {
  const catalog = await listUniverseDocuments();
  const document = catalog.find((entry) => entry.path === relativePath);
  if (!document) return null;
  const absolutePath = path.resolve(REPO_ROOT, relativePath);
  if (!absolutePath.startsWith(REPO_ROOT + path.sep)) return null;
  const content = await readFile(absolutePath, "utf8");
  return { ...document, content: content.slice(0, 250_000) };
}

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

function hashFloat(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return (h >>> 0) / 0xffffffff;
}

const ZONE_COLORS: Record<string, string> = {
  memory: "#d8fbff",
  aegis: "#35c8ff",
  router: "#b675ff",
  agents: "#ff76c8",
  observatory: "#6fd7ff",
  forge: "#ffb64f",
  marketplace: "#63f0ba",
};

const ZONE_POSITIONS: Record<string, [number, number, number]> = {
  memory:      [ 90000,  28000, -158000],
  aegis:       [-108000, 22000, -196000],
  router:      [ 46000, -48000, -234000],
  agents:      [-138000,-36000, -270000],
  observatory: [ 150000, 56000, -308000],
  forge:       [-62000,  84000, -342000],
  marketplace: [ 126000,-78000, -378000],
};

const ZONE_LABELS: Record<string, string> = {
  memory: "Memory Atmosphere",
  aegis: "Aegis System",
  router: "Router System",
  agents: "Agent Nexus",
  observatory: "Observatory System",
  forge: "Forge System",
  marketplace: "Marketplace System",
};

const ZONE_KEYWORDS: Record<string, string[]> = {
  memory:      ["readme", "memory", "data", "knowledge", "document", "engineering", "project", "setup"],
  aegis:       ["security", "compliance", "governance", "incident", "policy", "privacy"],
  router:      ["router", "model", "provider", "gateway"],
  agents:      ["agent", "workflow", "task", "automation"],
  observatory: ["analytics", "usage", "performance", "launch", "checklist", "test"],
  forge:       ["build", "integration", "template", "deploy"],
  marketplace: ["marketplace", "market", "product", "sales"],
};

function documentZone(doc: { path: string; title: string }): string {
  const haystack = `${doc.path} ${doc.title}`.toLowerCase();
  for (const [zone, keywords] of Object.entries(ZONE_KEYWORDS)) {
    if (keywords.some((kw) => haystack.includes(kw))) return zone;
  }
  return "memory";
}

export function buildGalaxyDescriptors(
  documents: Array<{ path: string; title: string }>,
  memoryRecords: Array<{ id: string; content: string; metadata: Record<string, string>; createdAt: string }>,
): GalaxyDescriptor[] {
  const zones = Object.keys(ZONE_LABELS);

  const docsByZone = new Map<string, Array<{ path: string; title: string }>>();
  for (const z of zones) docsByZone.set(z, []);
  for (const doc of documents) {
    const zone = documentZone(doc);
    docsByZone.get(zone)?.push(doc);
  }

  return zones.map((zoneId) => {
    const color = ZONE_COLORS[zoneId] ?? "#aabbff";
    const position = ZONE_POSITIONS[zoneId] ?? ([0, 0, -200000] as [number, number, number]);
    const zoneDocs = docsByZone.get(zoneId) ?? [];
    const zoneMemories = zoneId === "memory" ? memoryRecords : [];

    const bodies: CelestialBody[] = [];

    zoneDocs.forEach((doc, i) => {
      const id = `${zoneId}-doc-${i}`;
      const h1 = hashFloat(id);
      const h2 = hashFloat(id + "spd");
      const h3 = hashFloat(id + "inc");
      bodies.push({
        id,
        parentId: null,
        label: doc.title,
        kind: "moon",
        description: `Document: ${doc.path}`,
        size: 0.18 + h1 * 0.22,
        orbitRadius: 18000 + i * 4800 + h1 * 6000,
        orbitSpeed: 0.08 + h2 * 0.14,
        orbitPhase: h1 * Math.PI * 2,
        orbitInclination: (h3 - 0.5) * 0.7,
        documentPath: doc.path,
        contentType: "document",
        addedAt: new Date().toISOString(),
        color,
      });
    });

    zoneMemories.forEach((mem, i) => {
      const id = `${zoneId}-mem-${mem.id}`;
      const h1 = hashFloat(id);
      const h2 = hashFloat(id + "spd");
      const h3 = hashFloat(id + "inc");
      bodies.push({
        id,
        parentId: null,
        label: (mem.metadata?.title) ?? `Memory ${i + 1}`,
        kind: "moon",
        description: mem.content.slice(0, 120),
        size: 0.12 + h1 * 0.18,
        orbitRadius: 22000 + i * 3600 + h1 * 4000,
        orbitSpeed: 0.06 + h2 * 0.1,
        orbitPhase: h1 * Math.PI * 2,
        orbitInclination: (h3 - 0.5) * 0.9,
        contentType: "memory",
        addedAt: mem.createdAt,
        color: "#9effd7",
      });
    });

    return {
      id: zoneId,
      label: ZONE_LABELS[zoneId] ?? zoneId,
      color,
      position,
      hostPlanet: {
        id: `${zoneId}-host`,
        label: ZONE_LABELS[zoneId] ?? zoneId,
        description: `The ${ZONE_LABELS[zoneId] ?? zoneId} is the central intelligence hub for this galaxy zone.`,
        size: 1.0 + Math.min(bodies.length * 0.04, 0.8),
      },
      bodies,
    };
  });
}
