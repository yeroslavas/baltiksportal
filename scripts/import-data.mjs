// Bulk importer for products, customers, and per-customer pricing.
//
// Usage (Node 20.6+ loads the env file natively):
//   node --env-file=.env.local scripts/import-data.mjs [options]
//
// Options:
//   --dry-run            Parse, validate, and report — but write NOTHING.
//   --products <path>    default: data/products.csv
//   --customers <path>   default: data/customers.csv
//   --pricing <path>     default: data/pricing.csv
//
// CSV columns (a header row is required; columns are matched by name,
// case-insensitive, so order/extra columns don't matter):
//   products.csv:   name, description, unit, base_price
//   customers.csv:  business_name, contact_name, email, phone, address, temp_password
//   pricing.csv:    business_name, product_name, custom_price
//
// Safe to re-run: products (matched by name) and customers (matched by email)
// that already exist are skipped; pricing is upserted on (customer, product).
// A blank temp_password is auto-generated and printed so you can share it.

import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ---- args ----------------------------------------------------------------
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const DRY = has("--dry-run");
const PATHS = {
  products: opt("--products", "data/products.csv"),
  customers: opt("--customers", "data/customers.csv"),
  pricing: opt("--pricing", "data/pricing.csv"),
};

// ---- supabase ------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/import-data.mjs",
  );
  process.exit(1);
}
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- helpers -------------------------------------------------------------

// Minimal RFC-4180 CSV parser: handles quoted fields, escaped "" quotes,
// commas/newlines inside quotes, and CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Returns array of row objects keyed by lower-cased header, or null if missing.
function readTable(path) {
  if (!existsSync(path)) return null;
  const rows = parseCsv(readFileSync(path, "utf8")).filter((r) =>
    r.some((c) => c.trim() !== ""),
  );
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}

function parseMoney(s) {
  const n = Number(String(s ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

// Returns an integer >= 0, null for blank, or false for invalid.
function parseIntOrNull(s) {
  const v = String(s ?? "").trim();
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return false;
  return parseInt(v, 10);
}

function genPassword() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  let out = "";
  for (const b of randomBytes(16)) out += chars[b % chars.length];
  return out;
}

async function listAllUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

// ---- importers -----------------------------------------------------------

// Derive report_group from the SKU naming convention. Keep in sync with
// src/lib/report-group.ts.
function deriveReportGroup(sku) {
  const s = (sku ?? "").trim();
  if (!s) return null;
  if (/^bulk_/i.test(s)) return "doz bagels";
  if (/^4-pk_/i.test(s)) return "pack_bagels";
  if (/qt_/i.test(s)) return "Qt_CC";
  if (/8oz_/i.test(s)) return "8oz_CC";
  return null;
}

async function importProducts() {
  const rows = readTable(PATHS.products);
  if (rows === null) {
    console.log(`• products: ${PATHS.products} not found — skipping`);
    return;
  }
  const { data: existing, error } = await admin.from("products").select("sku");
  if (error) return console.error("  ! reading products:", error.message);
  const haveSku = new Set((existing ?? []).map((p) => p.sku).filter(Boolean));

  const records = [];
  const seen = new Set();
  let bad = 0;
  for (const [idx, r] of rows.entries()) {
    const line = idx + 2;
    const sku = r.sku;
    const name = r.name;
    const base = parseMoney(r.base_price);
    const count = parseIntOrNull(r.report_count);
    if (!sku) {
      console.error(`  ! row ${line}: missing sku — skipped`);
      bad++;
      continue;
    }
    if (seen.has(sku)) {
      console.error(`  ! row ${line}: duplicate sku "${sku}" in file — skipped`);
      bad++;
      continue;
    }
    if (!name) {
      console.error(`  ! row ${line} (${sku}): missing name — skipped`);
      bad++;
      continue;
    }
    if (base === null) {
      console.error(
        `  ! row ${line} (${sku}): invalid base_price "${r.base_price}" — skipped`,
      );
      bad++;
      continue;
    }
    if (count === false) {
      console.error(
        `  ! row ${line} (${sku}): invalid report_count "${r.report_count}" — skipped`,
      );
      bad++;
      continue;
    }
    seen.add(sku);
    // is_active is intentionally omitted: new rows default to true, and existing
    // rows keep whatever the admin set (a re-import won't silently reactivate).
    // sort_order = position in the file, so the spreadsheet order IS the catalog
    // order (line - 1 = the data row's 1-based position).
    records.push({
      sku,
      name,
      description: r.description || null,
      unit: r.unit || "dozen",
      base_price: base,
      bake_time: r.bake_time || null,
      product_type: r.product_type || null,
      // SKU convention drives the group; the CSV value is only a fallback.
      report_group: deriveReportGroup(sku) ?? (r.report_group || null),
      report_unit: r.report_unit || null,
      report_count: count,
      sort_order: line - 1,
    });
  }

  const created = records.filter((r) => !haveSku.has(r.sku)).length;
  const updated = records.length - created;
  if (!DRY && records.length) {
    const { error: e } = await admin
      .from("products")
      .upsert(records, { onConflict: "sku" });
    if (e) return console.error("  ! products upsert failed:", e.message);
  }
  console.log(
    `✓ products: ${created} ${DRY ? "to create" : "created"}, ${updated} ${DRY ? "to update" : "updated"}, ${bad} errors`,
  );
}

async function importCustomers() {
  const rows = readTable(PATHS.customers);
  if (rows === null) {
    console.log(`• customers: ${PATHS.customers} not found — skipping`);
    return;
  }
  const { data: custRows, error: cErr } = await admin
    .from("customers")
    .select("id,email");
  if (cErr) return console.error("  ! reading customers:", cErr.message);
  const custByEmail = new Map(
    (custRows ?? [])
      .filter((c) => c.email)
      .map((c) => [c.email.toLowerCase(), c.id]),
  );
  const authEmails = new Set(
    (await listAllUsers()).map((u) => (u.email ?? "").toLowerCase()),
  );

  const created = [];
  const seen = new Set();
  let updated = 0;
  let skipped = 0;
  let bad = 0;
  for (const [idx, r] of rows.entries()) {
    const line = idx + 2;
    const business = r.business_name;
    const email = (r.email ?? "").toLowerCase();
    if (!business || !email) {
      console.error(`  ! row ${line}: missing business_name or email — skipped`);
      bad++;
      continue;
    }
    if (seen.has(email)) {
      console.error(
        `  ! row ${line}: duplicate email "${email}" in file — skipped`,
      );
      bad++;
      continue;
    }
    seen.add(email);

    const fields = {
      business_name: business,
      contact_name: r.contact_name || null,
      email,
      phone: r.phone || null,
      address: r.address || null,
      sales_rep: r.sales_rep || null,
      tier: r.tier || null,
      notes: r.notes || null,
    };

    // Existing customer → update profile, leave login + password untouched.
    if (custByEmail.has(email)) {
      if (!DRY) {
        const { error: e } = await admin
          .from("customers")
          .update(fields)
          .eq("id", custByEmail.get(email));
        if (e) {
          console.error(`  ! row ${line} (${business}): ${e.message}`);
          bad++;
          continue;
        }
      }
      updated++;
      continue;
    }

    // Email is already a non-customer login (e.g. an admin) → leave it alone.
    if (authEmails.has(email)) {
      console.error(
        `  ! row ${line} (${business}): ${email} is already a non-customer login — skipped`,
      );
      skipped++;
      continue;
    }

    // New customer → create login + profile.
    const password = r.temp_password || genPassword();
    if (password.length < 8) {
      console.error(
        `  ! row ${line} (${business}): temp_password under 8 chars — skipped`,
      );
      bad++;
      continue;
    }
    if (!DRY) {
      const { data: u, error: ae } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (ae || !u.user) {
        console.error(
          `  ! row ${line} (${business}): ${ae?.message ?? "auth create failed"}`,
        );
        bad++;
        continue;
      }
      const { error: ie } = await admin
        .from("customers")
        .insert({ user_id: u.user.id, ...fields });
      if (ie) {
        await admin.auth.admin.deleteUser(u.user.id); // roll back orphan login
        console.error(`  ! row ${line} (${business}): ${ie.message}`);
        bad++;
        continue;
      }
    }
    created.push({
      business,
      email,
      password: DRY ? "(generated on run)" : password,
    });
  }
  console.log(
    `✓ customers: ${created.length} ${DRY ? "to create" : "created"}, ${updated} ${DRY ? "to update" : "updated"}, ${skipped} skipped, ${bad} errors`,
  );
  if (created.length) {
    console.log("\n  Credentials to share with customers:");
    for (const c of created)
      console.log(
        `    ${c.business.padEnd(26)} ${c.email.padEnd(32)} ${c.password}`,
      );
    console.log("");
  }
}

async function importPricing() {
  const rows = readTable(PATHS.pricing);
  if (rows === null) {
    console.log(`• pricing: ${PATHS.pricing} not found — skipping`);
    return;
  }
  const [{ data: custs }, { data: prods }] = await Promise.all([
    admin.from("customers").select("id,business_name,email"),
    admin.from("products").select("id,name,sku"),
  ]);
  // Customers match by email (stable) first, business_name as fallback.
  const custByEmail = new Map(
    (custs ?? [])
      .filter((c) => c.email)
      .map((c) => [c.email.toLowerCase(), c.id]),
  );
  const custByName = new Map(
    (custs ?? []).map((c) => [c.business_name.trim().toLowerCase(), c.id]),
  );
  // Products match by SKU (stable, rename-proof) first, name as fallback.
  const prodBySku = new Map(
    (prods ?? [])
      .filter((p) => p.sku)
      .map((p) => [p.sku.trim().toLowerCase(), p.id]),
  );
  const prodByName = new Map(
    (prods ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]),
  );

  const toUpsert = [];
  const seen = new Set();
  let blanks = 0;
  let bad = 0;
  for (const [idx, r] of rows.entries()) {
    const line = idx + 2;
    const rawPrice = (r.custom_price ?? "").trim();

    // Blank price = no override; the customer simply sees the base price.
    // (An explicit 0 is kept as a real $0 price.)
    if (rawPrice === "") {
      blanks++;
      continue;
    }

    let cid, clabel;
    if (r.email) {
      cid = custByEmail.get(r.email.toLowerCase());
      clabel = `email "${r.email}"`;
    }
    if (!cid && r.business_name) {
      cid = custByName.get(r.business_name.toLowerCase());
      clabel = `customer "${r.business_name}"`;
    }
    if (!clabel) clabel = "customer (need an email or business_name column)";

    let pid, plabel;
    const skuVal = r.sku || r.product_sku; // accept "sku" or "product_sku"
    if (skuVal) {
      pid = prodBySku.get(skuVal.toLowerCase());
      plabel = `SKU "${skuVal}"`;
    }
    if (!pid && r.product_name) {
      pid = prodByName.get(r.product_name.toLowerCase());
      plabel = `product "${r.product_name}"`;
    }
    if (!plabel) plabel = "product (need a sku or product_name column)";

    const price = parseMoney(rawPrice);
    if (!cid) {
      console.error(`  ! row ${line}: unknown ${clabel} — skipped`);
      bad++;
      continue;
    }
    if (!pid) {
      console.error(`  ! row ${line}: unknown ${plabel} — skipped`);
      bad++;
      continue;
    }
    if (price === null) {
      console.error(
        `  ! row ${line}: invalid custom_price "${r.custom_price}" — skipped`,
      );
      bad++;
      continue;
    }

    const key = `${cid}|${pid}`;
    if (seen.has(key)) {
      console.error(
        `  ! row ${line}: duplicate ${clabel} + ${plabel} in file — skipped`,
      );
      bad++;
      continue;
    }
    seen.add(key);

    toUpsert.push({ customer_id: cid, product_id: pid, custom_price: price });
  }

  if (!DRY && toUpsert.length) {
    const { error } = await admin
      .from("customer_pricing")
      .upsert(toUpsert, { onConflict: "customer_id,product_id" });
    if (error) {
      console.error("  ! pricing upsert failed:", error.message);
      return;
    }
  }
  console.log(
    `✓ pricing: ${toUpsert.length} ${DRY ? "to upsert" : "upserted"}, ${blanks} blank → base price, ${bad} errors`,
  );
}

// ---- run -----------------------------------------------------------------
console.log(`\nBaltiks data import${DRY ? "  (DRY RUN — no writes)" : ""}\n`);
await importProducts();
await importCustomers();
await importPricing();
console.log(`\nDone${DRY ? " (dry run)" : ""}.\n`);
