"use client";

import { useEffect, useState } from "react";

type SessionState = "loading" | "signed-out" | "signed-in" | "error";

export function WorkspaceSession() {
  const [state, setState] = useState<SessionState>("loading");
  const [workspace, setWorkspace] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/workspace", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) { setState(response.status === 401 ? "signed-out" : "error"); return; }
      const body = await response.json() as { workspace?: { name?: string } };
      setWorkspace(body.workspace?.name ?? "UIOS workspace"); setState("signed-in");
    }).catch(() => setState("error"));
  }, []);

  async function createWorkspace() {
    setBusy(true);
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "UIOS workspace" }) });
      if (!response.ok) throw new Error("Workspace setup is unavailable.");
      window.location.reload();
    } catch { setState("error"); setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.reload();
  }

  if (state === "loading") return <div className="workspace-session" role="status">Checking workspace session…</div>;
  if (state === "signed-out") return <div className="workspace-session workspace-session-setup"><span><strong>Secure workspace required</strong><small>Create a signed session to use the UIOS controls.</small></span><button className="button" onClick={createWorkspace} disabled={busy}>{busy ? "Setting up…" : "Create workspace"}</button></div>;
  if (state === "error") return <div className="workspace-session workspace-session-error" role="alert">Workspace session could not be verified. Refresh and try again.</div>;
  return <div className="workspace-session"><span><span className="live-dot" /> {workspace}</span><button className="text-button" onClick={logout} disabled={busy}>Sign out</button></div>;
}
