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
