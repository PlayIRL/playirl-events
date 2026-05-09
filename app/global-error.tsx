"use client";

// Last-resort error boundary for catastrophic crashes inside the root layout
// itself — e.g. the html/body chain throws, or `error.tsx` couldn't render
// because the layout was the source of the error. Next.js requires this
// file to render its own `<html>` and `<body>` because the root layout is
// presumed broken. Keep zero dependencies and zero imports of project code:
// importing `app/playirl-logo.tsx` here would defeat the purpose if the
// failure was in our component tree.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#0a0a0a",
          color: "#f5f5f5",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#f87171",
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Site unavailable
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 12px" }}>
            PlayIRL.GG hit an unexpected error
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#a3a3a3" }}>
            The page failed to render. Please try again — and if the problem
            persists, please report it on Discord.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                color: "#737373",
                marginTop: 12,
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "10px 18px",
                borderRadius: 6,
                border: "none",
                background: "#f5f5f5",
                color: "#0a0a0a",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "10px 18px",
                borderRadius: 6,
                border: "1px solid #404040",
                color: "#f5f5f5",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Back to homepage
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
