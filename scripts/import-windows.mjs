// Bulk-assign customer delivery/pickup windows (only touches delivery_window).
//
// Usage (Node 20.6+ loads the env file natively):
//   node --env-file=.env.local scripts/import-windows.mjs
//
// Put data/delivery-windows.csv with columns (header row required):
//   business_name (or email), delivery_window
// The window is matched leniently (dashes/case/spacing) to one of the canonical
// windows below; a blank clears the customer's window. Safe to re-run.

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Keep in sync with DELIVERY_TIME_WINDOWS in src/lib/types.ts.
const WINDOWS = ["7:00–8:30 AM", "9:30–11:30 AM"];
// Shorthand aliases (e.g. from a source spreadsheet) → canonical window.
const ALIASES = {
  "7a-8:30a": "7:00–8:30 AM",
  "9:30-11:30a": "9:30–11:30 AM",
};
const PATH = "data/delivery-windows.csv";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/import-windows.mjs",
  );
  process.exit(1);
}
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseCsv(t) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function readTable(path) {
  const rows = parseCsv(readFileSync(path, "utf8")).filter((r) =>
    r.some((c) => c.trim() !== ""),
  );
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}

const normalize = (s) =>
  String(s ?? "").toLowerCase().replace(/[–—-]/g, "-").replace(/\s+/g, " ").trim();
const canonical = new Map([
  ...WINDOWS.map((w) => [normalize(w), w]),
  ...Object.entries(ALIASES).map(([k, v]) => [normalize(k), v]),
]);

if (!existsSync(PATH)) {
  console.log(`${PATH} not found — create it (business_name, delivery_window).`);
  process.exit(0);
}

const { data: custs, error } = await admin
  .from("customers")
  .select("id, business_name, email");
if (error) { console.error("reading customers:", error.message); process.exit(1); }
const byEmail = new Map(
  (custs ?? []).filter((c) => c.email).map((c) => [c.email.toLowerCase(), c.id]),
);
const byName = new Map(
  (custs ?? []).map((c) => [c.business_name.trim().toLowerCase(), c.id]),
);

let assigned = 0, cleared = 0, bad = 0;
for (const [idx, r] of readTable(PATH).entries()) {
  const line = idx + 2;

  let cid, label;
  if (r.email) { cid = byEmail.get(r.email.toLowerCase()); label = `email "${r.email}"`; }
  if (!cid && r.business_name) {
    cid = byName.get(r.business_name.toLowerCase());
    label = `customer "${r.business_name}"`;
  }
  if (!label) label = "customer (need an email or business_name column)";
  if (!cid) { console.error(`  ! row ${line}: unknown ${label} — skipped`); bad++; continue; }

  const raw = String(r.delivery_window ?? "").trim();
  let value;
  if (raw === "") value = null;
  else {
    value = canonical.get(normalize(raw));
    if (!value) {
      console.error(`  ! row ${line}: "${raw}" is not a known window — skipped`);
      bad++;
      continue;
    }
  }

  const { error: e } = await admin
    .from("customers")
    .update({ delivery_window: value })
    .eq("id", cid);
  if (e) { console.error(`  ! row ${line}: ${e.message}`); bad++; continue; }
  if (value === null) cleared++;
  else assigned++;
}

console.log(`\n✓ windows: ${assigned} assigned, ${cleared} cleared, ${bad} errors\n`);
