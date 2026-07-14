"use client";

import { useEffect } from "react";

// global-error.tsx catches errors thrown in the root layout itself.
// It MUST include its own <html> and <body> tags.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[UIOS] Layout-level error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#010207",
          color: "#e8eaf0",
          fontFamily: "system-ui, sans-serif",
          gap: "1.25rem",
          padding: "2rem",
          textAlign: "center",
          margin: 0,
        }}
      >
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#e8eaf0",
            margin: 0,
          }}
        >
          UIOS encountered a critical error
        </h1>
        <p
          style={{
            fontSize: "0.9375rem",
            color: "#8899bb",
            maxWidth: 440,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          The application shell failed to load. Please refresh the page. If the
          problem persists, contact{" "}
          <a
            href="mailto:security@uios.dev"
            style={{ color: "#b55cff", textDecoration: "none" }}
          >
            support
          </a>
          .
          {error.digest && (
            <span
              style={{
                display: "block",
                marginTop: "0.5rem",
                fontSize: "0.8rem",
                color: "#556",
              }}
            >
              Error ID: {error.digest}
            </span>
          )}
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.6rem 1.4rem",
            background: "linear-gradient(135deg, #b55cff, #7b3fe4)",
            color: "#fff",
            border: "none",
            borderRadius: "0.5rem",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
