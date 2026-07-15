import { NextRequest } from "next/server";
import { rejectUnauthorized, resolveTenantId } from "../../../lib/runtime";
import { getJob, ingestionEvents } from "../../../lib/ingestion-queue";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await rejectUnauthorized(request);
  if (authError) return authError;

  const tenantId = await resolveTenantId(request);
  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return Response.json({ error: "Missing jobId parameter." }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job || job.tenantId !== tenantId) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  const acceptHeader = request.headers.get("accept");
  const isSSE = acceptHeader && acceptHeader.includes("text/event-stream");

  if (isSSE) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const sendUpdate = (status: string, progress: number, error?: string) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ jobId, status, progress, error })}\n\n`)
            );
          } catch (e) {
            // Stream might be closed
          }
        };

        sendUpdate(job.status, job.progress, job.error);

        if (job.status === "completed" || job.status === "failed") {
          controller.close();
          return;
        }

        const onStatusUpdate = (update: { jobId: string; status: string; progress: number; error?: string }) => {
          if (update.jobId === jobId) {
            sendUpdate(update.status, update.progress, update.error);
            if (update.status === "completed" || update.status === "failed") {
              cleanup();
              controller.close();
            }
          }
        };

        const cleanup = () => {
          ingestionEvents.off("status", onStatusUpdate);
        };

        ingestionEvents.on("status", onStatusUpdate);

        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch (e) {
            cleanup();
            clearInterval(pingInterval);
          }
        }, 15000);

        request.signal.addEventListener("abort", () => {
          cleanup();
          clearInterval(pingInterval);
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } else {
    return Response.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
    });
  }
}
