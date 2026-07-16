"use client";

import { useEffect, useState } from "react";
import type { CelestialBody } from "../engine/UniverseManager";

export type CelestialInfoPanelProps = {
  body: CelestialBody | null;
  onClose: () => void;
};

export function CelestialInfoPanel({ body, onClose }: CelestialInfoPanelProps) {
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!body) { setFullContent(null); return; }
    if (body.contentType !== "document" && body.contentType !== "file") {
      setFullContent(body.description);
      return;
    }
    const path = body.documentPath;
    if (!path) { setFullContent(body.description); return; }
    setLoading(true);
    setFullContent(null);
    void fetch(`/api/universe/body?path=${encodeURIComponent(path)}`)
      .then((r) => r.json() as Promise<{ fullContent?: string }>)
      .then((data) => setFullContent(data.fullContent ?? body.description))
      .catch(() => setFullContent(body.description))
      .finally(() => setLoading(false));
  }, [body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!body) return null;

  const TYPE_LABEL: Record<string, string> = {
    document: "DOCUMENT",
    file: "FILE",
    folder: "FOLDER",
    memory: "MEMORY RECORD",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 19,
          background: "rgba(0,0,0,0.38)",
        }}
      />
      {/* Panel */}
      <div style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(680px, 92vw)",
        maxHeight: "80vh",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        backdropFilter: "blur(32px)",
        background: "linear-gradient(150deg, rgba(4,13,34,0.96), rgba(14,4,30,0.92))",
        border: `1px solid ${body.color}33`,
        borderRadius: 20,
        boxShadow: `0 0 80px ${body.color}22, 0 32px 80px rgba(0,0,0,0.7), inset 0 1px rgba(255,255,255,0.05)`,
        overflow: "hidden",
        animation: "cel-panel-in 0.28s cubic-bezier(0.2,0.8,0.2,1) both",
      }}>
        <style>{`
          @keyframes cel-panel-in {
            from { opacity:0; transform:translate(-50%,-48%) scale(0.96); }
            to   { opacity:1; transform:translate(-50%,-50%) scale(1); }
          }
          .cel-content::-webkit-scrollbar { width: 4px; }
          .cel-content::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
          .cel-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        `}</style>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "22px 26px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              color: body.color, fontFamily: "ui-monospace,monospace",
              fontSize: 8, fontWeight: 800, letterSpacing: "0.15em", marginBottom: 6,
            }}>
              ◈ {TYPE_LABEL[body.contentType] ?? "BODY"}
            </div>
            <div style={{ color: "#f0f4ff", fontSize: 18, fontWeight: 500, lineHeight: 1.3 }}>
              {body.label}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "#556",
              cursor: "pointer", fontSize: 22, lineHeight: 1,
              padding: "2px 4px", marginLeft: 16, flexShrink: 0,
            }}
            aria-label="Close"
          >×</button>
        </div>

        {/* Content */}
        <div
          className="cel-content"
          style={{
            overflowY: "auto", padding: "20px 26px 26px",
            flex: 1, minHeight: 0,
          }}
        >
          {loading && (
            <div style={{ color: "#556", fontFamily: "ui-monospace,monospace", fontSize: 10 }}>
              Loading content…
            </div>
          )}
          {!loading && fullContent && (
            <pre style={{
              color: "#b0bbd8", fontFamily: "ui-monospace,SFMono-Regular,monospace",
              fontSize: 11, lineHeight: 1.7, margin: 0,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {fullContent.slice(0, 8000)}
              {fullContent.length > 8000 && (
                <span style={{ color: "#445", display: "block", marginTop: 12 }}>
                  … {(fullContent.length - 8000).toLocaleString()} more characters
                </span>
              )}
            </pre>
          )}
          <div style={{
            color: "#3a4160", fontFamily: "ui-monospace,monospace",
            fontSize: 8, letterSpacing: "0.06em", marginTop: 20,
          }}>
            ADDED {new Date(body.addedAt).toLocaleDateString(undefined, {
              month: "short", day: "numeric", year: "numeric",
            }).toUpperCase()}
          </div>
        </div>
      </div>
    </>
  );
}
