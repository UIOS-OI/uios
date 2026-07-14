"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to an error reporting service in production
    console.error("[UIOS] Route error:", error);
  }, [error]);

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#010207",
        color: "#e8eaf0",
        fontFamily: "system-ui, sans-serif",
        gap: "1.5rem",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #b55cff44, #42d7ff22)",
          border: "1px solid #b55cff55",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
          marginBottom: "0.5rem",
        }}
        aria-hidden="true"
      >
        ⚠
      </div>
      <h1
        style={{
          fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
          fontWeight: 700,
          color: "#e8eaf0",
          margin: 0,
          letterSpacing: "-0.02em",
        }}
      >
        Something went wrong
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
        UIOS encountered an unexpected error. You can try again or return to the
        overview.
        {error.digest && (
          <span style={{ display: "block", marginTop: "0.5rem", fontSize: "0.8rem", color: "#556" }}>
            Error ID: {error.digest}
          </span>
        )}
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
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
            letterSpacing: "0.01em",
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            padding: "0.6rem 1.4rem",
            background: "transparent",
            color: "#8899bb",
            border: "1px solid #334",
            borderRadius: "0.5rem",
            fontWeight: 500,
            fontSize: "0.9rem",
            textDecoration: "none",
            letterSpacing: "0.01em",
          }}
        >
          Return to UIOS
        </a>
      </div>
    </main>
  );
}
