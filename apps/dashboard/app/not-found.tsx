import Link from "next/link";

export default function NotFound() {
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
          fontSize: "4rem",
          fontWeight: 800,
          background: "linear-gradient(135deg, #b55cff, #42d7ff)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          lineHeight: 1,
          letterSpacing: "-0.04em",
        }}
        aria-hidden="true"
      >
        404
      </div>
      <h1
        style={{
          fontSize: "clamp(1.1rem, 3vw, 1.5rem)",
          fontWeight: 700,
          color: "#e8eaf0",
          margin: 0,
          letterSpacing: "-0.02em",
        }}
      >
        Page not found
      </h1>
      <p
        style={{
          fontSize: "0.9375rem",
          color: "#8899bb",
          maxWidth: 400,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        This page does not exist in the UIOS universe. It may have moved or the
        address may be incorrect.
      </p>
      <Link
        href="/"
        style={{
          padding: "0.6rem 1.4rem",
          background: "linear-gradient(135deg, #b55cff, #7b3fe4)",
          color: "#fff",
          borderRadius: "0.5rem",
          fontWeight: 600,
          fontSize: "0.9rem",
          textDecoration: "none",
          letterSpacing: "0.01em",
        }}
      >
        Return to UIOS
      </Link>
    </main>
  );
}
