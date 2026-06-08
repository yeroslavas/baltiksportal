// Bulk product-photo importer.
//
// Usage (Node 20.6+ loads the env file natively):
//   node --env-file=.env.local scripts/import-images.mjs
//
// Put one image per product in data/images/, named by the product's SKU:
//   data/images/Bulk_Everything.jpg
//   data/images/Bulk_Plain.webp
// Supported: .jpg .jpeg .png .webp. The script (re-runnable) creates the public
// "product-images" Storage bucket if needed, uploads each file, and sets the
// product's image_url. Re-running replaces an image (upload is upsert).

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { extname, basename, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/import-images.mjs",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = "product-images";
const DIR = "data/images";
const CONTENT_TYPE = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

if (!existsSync(DIR)) {
  console.log(`${DIR} not found — create it and add <sku>.jpg files, then re-run.`);
  process.exit(0);
}

// Ensure the public bucket exists (idempotent).
const { error: bucketErr } = await admin.storage.createBucket(BUCKET, {
  public: true,
});
if (bucketErr && !/already exists/i.test(bucketErr.message)) {
  console.error("Could not create bucket:", bucketErr.message);
  process.exit(1);
}

// Map SKU -> product id.
const { data: prods, error: prodErr } = await admin
  .from("products")
  .select("id, sku");
if (prodErr) {
  console.error("Could not read products:", prodErr.message);
  process.exit(1);
}
const bySku = new Map(
  (prods ?? []).filter((p) => p.sku).map((p) => [p.sku.trim().toLowerCase(), p.id]),
);

const files = readdirSync(DIR).filter((f) =>
  /\.(jpe?g|png|webp)$/i.test(f),
);

let uploaded = 0;
let bad = 0;
const seen = new Set();
for (const file of files) {
  const ext = extname(file).toLowerCase();
  const sku = basename(file, extname(file));
  const key = sku.toLowerCase();

  if (seen.has(key)) {
    console.error(`  ! ${file}: duplicate SKU "${sku}" (another file already used it) — skipped`);
    bad++;
    continue;
  }
  const pid = bySku.get(key);
  if (!pid) {
    console.error(`  ! ${file}: no product with SKU "${sku}" — skipped`);
    bad++;
    continue;
  }
  seen.add(key);

  const body = readFileSync(join(DIR, file));
  const path = `${sku}${ext}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, body, { contentType: CONTENT_TYPE[ext], upsert: true });
  if (upErr) {
    console.error(`  ! ${file}: ${upErr.message}`);
    bad++;
    continue;
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust so a replaced image refreshes instead of serving a stale CDN copy.
  const imageUrl = `${pub.publicUrl}?v=${body.length}`;
  const { error: setErr } = await admin
    .from("products")
    .update({ image_url: imageUrl })
    .eq("id", pid);
  if (setErr) {
    console.error(`  ! ${file}: ${setErr.message}`);
    bad++;
    continue;
  }
  uploaded++;
}

console.log(`\n✓ images: ${uploaded} uploaded/linked, ${bad} errors\n`);
