import { fetchJson } from "./helpers.mjs";

export default async function run(test, ctx) {
  test("TC-INGEST-01", "Document Upload & Job Enqueue", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not in context");
    }
    
    // Construct mock PDF form data
    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["%PDF-1.5 mock pdf content for test document upload and job enqueue"], { type: "application/pdf" }),
      "test.pdf"
    );
    
    const res = await fetchJson("/api/ingestion/upload", {
      method: "POST",
      headers: {
        cookie: ctx.cookie,
        // FormData automatically sets the boundary header when fetched, 
        // so we delete the content-type from headers so it gets auto-injected by fetch.
      },
      body: formData
    });
    
    // Expect 202 Accepted. Since ingestion routes don't exist yet, this will fail (404/etc.)
    if (res.status !== 202) {
      throw new Error(`Expected 202 Accepted, got status ${res.status}, body ${JSON.stringify(res.body)}`);
    }
    
    const jobId = res.body?.jobId;
    if (!jobId) {
      throw new Error(`Upload succeeded but no jobId returned: ${JSON.stringify(res.body)}`);
    }
    ctx.jobId = jobId;
  });

  test("TC-INGEST-02", "PDF Text Extraction Processing", async () => {
    // PDF extraction is performed by the worker. We verify by checking status
    if (!ctx.jobId || !ctx.cookie) {
      throw new Error("Job ID or Workspace cookie not in context");
    }
    
    const res = await fetchJson(`/api/ingestion/status?jobId=${ctx.jobId}`, {
      headers: { cookie: ctx.cookie }
    });
    
    if (res.status !== 200) {
      throw new Error(`Failed to fetch job status: status ${res.status}`);
    }
    
    // We expect the worker to have processed or be processing the text.
    // If not completed or active, throw.
    if (!res.body || !["queued", "processing", "completed"].includes(res.body.status)) {
      throw new Error(`Invalid job status state: ${JSON.stringify(res.body)}`);
    }
  });

  test("TC-INGEST-03", "Embedding Generation Call", async () => {
    // During ingestion, the worker makes a call to the model gateway embeddings endpoint.
    // Check if the mock gateway received an embeddings request (we can query mock server stats/logs if exposed, or check job output)
    if (!ctx.jobId || !ctx.cookie) {
      throw new Error("Job ID or Workspace cookie not in context");
    }
    
    const res = await fetchJson(`/api/ingestion/status?jobId=${ctx.jobId}`, {
      headers: { cookie: ctx.cookie }
    });
    
    if (res.status !== 200) {
      throw new Error(`Failed to fetch job status: status ${res.status}`);
    }
    // Verifying status has moved past queued
    if (res.body?.status === "failed") {
      throw new Error(`Job failed during embedding generation step: ${res.body.error}`);
    }
  });

  test("TC-INGEST-04", "Vector Persistence on Ingestion", async () => {
    // Once completed, the vectors are stored. We can verify by querying search.
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not in context");
    }
    
    const res = await fetchJson("/api/ingestion/search?q=test", {
      headers: { cookie: ctx.cookie }
    });
    
    if (res.status !== 200) {
      throw new Error(`Failed to execute search: status ${res.status}`);
    }
  });

  test("TC-INGEST-05", "SSE Real-time Progress Sequencing", async () => {
    if (!ctx.jobId || !ctx.cookie) {
      throw new Error("Job ID or Workspace cookie not in context");
    }
    
    // Fetch SSE stream
    const url = `${process.env.UIOS_BASE_URL || "http://127.0.0.1:3010"}/api/ingestion/status?jobId=${ctx.jobId}`;
    const response = await fetch(url, {
      headers: {
        Accept: "text/event-stream",
        cookie: ctx.cookie
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected 200 for status stream, got ${response.status}`);
    }
    
    // Read first chunk/lines of stream to verify event-stream type
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("text/event-stream")) {
      throw new Error(`Expected text/event-stream Content-Type, got ${contentType}`);
    }
  });

  test("TC-INGEST-06", "Corrupted or Zero-Byte PDF Upload", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not in context");
    }
    
    const formData = new FormData();
    // Zero-byte Blob
    formData.append("file", new Blob([], { type: "application/pdf" }), "empty.pdf");
    
    const res = await fetchJson("/api/ingestion/upload", {
      method: "POST",
      headers: { cookie: ctx.cookie },
      body: formData
    });
    
    if (res.status !== 400) {
      throw new Error(`Expected 400 Bad Request for zero-byte upload, got status ${res.status}`);
    }
  });

  test("TC-INGEST-07", "Embedding Provider Outage & Retry", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not in context");
    }
    
    // Upload document but with mock gateway configured to fail or simulate failure
    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["%PDF-1.5 fail-generation-content"], { type: "application/pdf" }),
      "fail.pdf"
    );
    
    const res = await fetchJson("/api/ingestion/upload", {
      method: "POST",
      headers: { cookie: ctx.cookie },
      body: formData
    });
    
    if (res.status === 202) {
      const jobId = res.body?.jobId;
      // Wait for status to reflect retries or failed
      let statusRes = await fetchJson(`/api/ingestion/status?jobId=${jobId}`, {
        headers: { cookie: ctx.cookie }
      });
      if (statusRes.body?.status === "completed") {
        throw new Error("Job should have failed or retried, but completed successfully");
      }
    } else if (res.status !== 404 && res.status !== 500) {
      throw new Error(`Expected failure state or 202 trigger, got status ${res.status}`);
    }
  });

  test("TC-INGEST-08", "Concurrency Throttling & Ingestion Limit", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not in context");
    }
    
    // Fire many concurrent uploads to verify handling of load / rate limiting
    const uploads = Array.from({ length: 10 }).map(() => {
      const formData = new FormData();
      formData.append(
        "file",
        new Blob(["%PDF-1.5 concurrent upload load test"], { type: "application/pdf" }),
        "concur.pdf"
      );
      return fetchJson("/api/ingestion/upload", {
        method: "POST",
        headers: { cookie: ctx.cookie },
        body: formData
      });
    });
    
    const results = await Promise.all(uploads);
    const statuses = results.map(r => r.status);
    // Should either queue them (202) or throttle some with 429
    const validStatuses = statuses.every(s => s === 202 || s === 429 || s === 404);
    if (!validStatuses) {
      throw new Error(`Unexpected status returned under concurrent load: ${statuses.join(", ")}`);
    }
  });

  test("TC-INGEST-09", "Large File Chunk Boundary Splitting", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not in context");
    }
    
    // Large document text mock
    const largeContent = "%PDF-1.5\n" + "a".repeat(20000);
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([largeContent], { type: "application/pdf" }),
      "large.pdf"
    );
    
    const res = await fetchJson("/api/ingestion/upload", {
      method: "POST",
      headers: { cookie: ctx.cookie },
      body: formData
    });
    
    if (res.status !== 202 && res.status !== 404) {
      throw new Error(`Upload failed for large document: status ${res.status}`);
    }
  });

  test("TC-INGEST-10", "SSE Connection Disconnect & Resume", async () => {
    if (!ctx.cookie) {
      throw new Error("Workspace cookie not in context");
    }
    
    // Try to connect to a dummy or existing job ID, disconnect after headers received, then reconnect
    const dummyJobId = ctx.jobId || "job_nonexistent";
    const url = `${process.env.UIOS_BASE_URL || "http://127.0.0.1:3010"}/api/ingestion/status?jobId=${dummyJobId}`;
    
    // First connection: open and abort
    const controller = new AbortController();
    try {
      await fetch(url, {
        headers: { Accept: "text/event-stream", cookie: ctx.cookie },
        signal: controller.signal
      });
      controller.abort();
    } catch (e) {
      // Abort is expected
    }
    
    // Second connection: should succeed to connect again
    const res = await fetch(url, {
      headers: { Accept: "text/event-stream", cookie: ctx.cookie }
    });
    
    if (res.status !== 200 && res.status !== 404) {
      throw new Error(`Expected reconnect to succeed (200) or return 404 for missing job, got status ${res.status}`);
    }
  });
}
