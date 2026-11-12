import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
// @ts-ignore
import pdf from "pdf-parse";
import { getGatewayProvider } from "./platform-services";
import { saveMemory } from "./state-store";
import type { MemoryRecord } from "@uios/contracts";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface IngestionJob {
  id: string;
  tenantId: string;
  fileName: string;
  fileType: string;
  status: JobStatus;
  progress: number;
  error?: string;
  createdAt: string;
}

class IngestionEvents extends EventEmitter {}
export const ingestionEvents = new IngestionEvents();

const jobsMap = new Map<string, IngestionJob>();
const jobBuffers = new Map<string, Buffer>();

// Simple queue for async processing
const queue: string[] = [];
let isProcessing = false;

export function getJob(jobId: string): IngestionJob | undefined {
  return jobsMap.get(jobId);
}

export function enqueueJob(
  tenantId: string,
  fileBuffer: Buffer,
  fileName: string,
  fileType: string
): string {
  const jobId = `job_${randomUUID()}`;
  const job: IngestionJob = {
    id: jobId,
    tenantId,
    fileName,
    fileType,
    status: "queued",
    progress: 0,
    createdAt: new Date().toISOString(),
  };

  jobsMap.set(jobId, job);
  jobBuffers.set(jobId, fileBuffer);
  queue.push(jobId);

  // Emit status change
  ingestionEvents.emit("status", { jobId, status: "queued", progress: 0 });

  // Trigger processing asynchronously
  processNextJob();

  return jobId;
}

async function extractText(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const isPdf = fileName.toLowerCase().endsWith(".pdf") || mimeType === "application/pdf";
  if (isPdf) {
    try {
      const data = await pdf(buffer);
      return data.text || "";
    } catch (err: any) {
      if (buffer.toString("utf8").startsWith("%PDF")) {
        return buffer.toString("utf8");
      }
      throw err;
    }
  } else {
    return buffer.toString("utf8");
  }
}

function segmentText(text: string, chunkSize = 500, overlap = 50): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let startIndex = 0;
  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    chunks.push(text.slice(startIndex, endIndex));
    if (endIndex === text.length) break;
    startIndex += (chunkSize - overlap);
  }
  return chunks;
}

export type EmbeddingBatch =
  | { status: "embedded"; model: string; dims: number; vectors: number[][] }
  | { status: "unembedded"; reason: string };

function assertValidVectors(vectors: unknown, expectedCount: number): number[][] {
  if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
    throw new Error(`Embedding provider returned ${Array.isArray(vectors) ? vectors.length : "no"} vectors for ${expectedCount} inputs.`);
  }
  let dims = -1;
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length === 0 || !vector.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error("Embedding provider returned a malformed vector.");
    }
    if (dims === -1) dims = vector.length;
    else if (vector.length !== dims) throw new Error("Embedding provider returned vectors with inconsistent dimensions.");
  }
  return vectors as number[][];
}

// Never substitutes placeholder vectors: without an embedder, chunks are stored as
// "unembedded" and remain reachable through lexical search (see DECISIONS.md D-04).
async function getEmbeddingsWithRetry(chunks: string[], retries = 3, delayMs = 1000): Promise<EmbeddingBatch> {
  const provider = getGatewayProvider();
  if (!provider || !provider.embed) {
    return { status: "unembedded", reason: provider ? "provider-has-no-embed" : "no-embedding-provider" };
  }

  const batchSize = 16;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    let lastError: unknown = null;
    let success = false;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        allEmbeddings.push(...assertValidVectors(await provider.embed(batch), batch.length));
        success = true;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        }
      }
    }

    if (!success) {
      throw new Error(`Embedding retrieval failed after ${retries} attempts. Last error: ${lastError instanceof Error ? lastError.message : "unknown"}`);
    }
  }

  const dims = allEmbeddings[0].length;
  if (allEmbeddings.some((vector) => vector.length !== dims)) throw new Error("Embedding provider returned vectors with inconsistent dimensions.");
  return { status: "embedded", model: provider.embeddingModelId, dims, vectors: allEmbeddings };
}

async function processNextJob() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  const jobId = queue.shift()!;
  const job = jobsMap.get(jobId);
  const buffer = jobBuffers.get(jobId);

  if (!job || !buffer) {
    isProcessing = false;
    processNextJob();
    return;
  }

  try {
    // 1. Update status to processing
    job.status = "processing";
    job.progress = 10;
    ingestionEvents.emit("status", { jobId, status: "processing", progress: 10 });

    // 2. Extract text
    const text = await extractText(buffer, job.fileName, job.fileType);
    job.progress = 30;
    ingestionEvents.emit("status", { jobId, status: "processing", progress: 30 });

    // 3. Segment text
    const chunks = segmentText(text);
    if (chunks.length === 0) {
      throw new Error("No text content could be extracted from the file.");
    }
    job.progress = 50;
    ingestionEvents.emit("status", { jobId, status: "processing", progress: 50 });

    // 4. Retrieve embeddings with retries/batching
    const embeddings = await getEmbeddingsWithRetry(chunks);
    job.progress = 80;
    ingestionEvents.emit("status", { jobId, status: "processing", progress: 80 });

    // 5. Save chunk records with honest embedding provenance
    for (let i = 0; i < chunks.length; i++) {
      const metadata: Record<string, string> = {
        fileName: job.fileName,
        chunkIndex: String(i),
        totalChunks: String(chunks.length),
        embeddingStatus: embeddings.status,
      };
      if (embeddings.status === "embedded") {
        metadata.embeddingModel = embeddings.model;
        metadata.embeddingDims = String(embeddings.dims);
      } else {
        metadata.embeddingReason = embeddings.reason;
      }
      const record: MemoryRecord & { embedding?: number[] } = {
        id: `chunk_${randomUUID()}`,
        tenantId: job.tenantId,
        content: chunks[i],
        metadata,
        createdAt: new Date().toISOString(),
        ...(embeddings.status === "embedded" ? { embedding: embeddings.vectors[i] } : {}),
      };
      await saveMemory(record);
    }

    // 6. Complete
    job.status = "completed";
    job.progress = 100;
    ingestionEvents.emit("status", { jobId, status: "completed", progress: 100 });
  } catch (error: any) {
    console.error(`[Ingestion Worker] Error processing job ${jobId}:`, error);
    job.status = "failed";
    job.error = error?.message || "Unknown error occurred";
    ingestionEvents.emit("status", { jobId, status: "failed", progress: job.progress, error: job.error });
  } finally {
    jobBuffers.delete(jobId);
    isProcessing = false;
    // Process next job asynchronously
    setTimeout(processNextJob, 0);
  }
}
