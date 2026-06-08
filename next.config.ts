import type { NextConfig } from "next";

// Baseline security headers applied to every response. (A full Content-Security
// -Policy is intentionally left out for now — it needs per-route testing with
// Next's inline scripts/styles and the Supabase + image-optimizer origins, so
// it's a deliberate follow-up rather than a risky blanket rule.)
const securityHeaders = [
  // Clickjacking: don't allow the app to be framed by other sites.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Don't let browsers MIME-sniff responses into a different type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Limit referrer leakage to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable powerful APIs the portal never uses.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Force HTTPS for two years (incl. subdomains) — matters for a custom domain.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
