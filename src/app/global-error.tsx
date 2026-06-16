"use client";

import { useEffect } from "react";

// Last-resort boundary for errors thrown in the ROOT layout itself (which the
// regular error.tsx can't catch). It replaces the entire document, so it renders
// its own <html>/<body> and uses inline styles — the app's layout and CSS may
// not be available at this point.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Arial, sans-serif",
          color: "#1c1917",
          background: "#fafaf9",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#78716c", margin: "0 0 1.5rem", fontSize: "0.9rem" }}>
            Sorry — something failed to load. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              border: "none",
              borderRadius: "0.5rem",
              background: "#c2410c",
              color: "#fff",
              padding: "0.5rem 1rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
