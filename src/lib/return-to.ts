// "Back to where you came from" for admin detail pages.
//
// A detail page can be reached from several places (the filtered invoice list, a
// customer's credit summary, an order), and a hard-coded back link throws away
// whatever filter/search/page the admin had set — forcing them to re-filter on
// every hop. Instead the LINKING page passes its own URL as `?from=…`, and the
// detail page turns that back into a labelled link.
//
// Security: `from` arrives from the URL, so it is untrusted. Only root-relative
// paths under /admin are accepted. Protocol-relative values ("//evil.example")
// and anything outside /admin fall back to the caller's default, so a crafted
// link can't point the back button off-site.

export type ReturnLink = { href: string; label: string };

const ADMIN_PATH = /^\/admin(?:\/[A-Za-z0-9\-_/[\]]*)?$/;

function labelFor(path: string, fallbackLabel: string): string {
  if (path === "/admin/invoices") return "Back to invoices";
  if (path.startsWith("/admin/invoices")) return "Back to invoices";
  if (path === "/admin/customers") return "Back to customers";
  if (path.startsWith("/admin/customers")) return "Back to customer";
  if (path === "/admin/orders") return "Back to orders";
  if (path.startsWith("/admin/orders")) return "Back to order";
  return fallbackLabel;
}

// Resolve a `?from=` value into a back link, falling back when it's absent or
// not a path we're willing to link to.
export function returnTo(
  from: string | undefined,
  fallback: ReturnLink,
): ReturnLink {
  if (!from) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(from);
  } catch {
    return fallback; // malformed percent-encoding
  }

  // Must be root-relative. Reject protocol-relative ("//host") and backslash
  // variants that some browsers normalise to a host.
  if (!decoded.startsWith("/")) return fallback;
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return fallback;

  const path = decoded.split("?")[0].split("#")[0];
  if (!ADMIN_PATH.test(path)) return fallback;

  return { href: decoded, label: labelFor(path, fallback.label) };
}

// Build the `?from=` query fragment a linking page appends to a detail URL.
// Returns "" when there's nothing worth remembering, so callers can concatenate
// unconditionally.
export function fromParam(currentUrl: string): string {
  return currentUrl ? `?from=${encodeURIComponent(currentUrl)}` : "";
}
