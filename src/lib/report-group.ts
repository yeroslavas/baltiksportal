// Derives a product's report_group from its SKU naming convention, so the
// reporting buckets (the Reporting page pie + metrics) stay consistent without
// manual tagging. Returns null when the SKU matches no known pattern — callers
// fall back to any manually-entered group.
//
// NOTE: keep this mapping in sync with the copy in scripts/import-data.mjs.
//   Bulk_…  → doz bagels   (sold by the dozen)
//   4-pk_…  → pack_bagels  (retail packs)
//   …QT_…   → Qt_CC        (quart cream cheese)
//   …8oz_…  → 8oz_CC       (8oz cream cheese)
export function deriveReportGroup(sku: string | null | undefined): string | null {
  const s = (sku ?? "").trim();
  if (!s) return null;
  if (/^bulk_/i.test(s)) return "doz bagels";
  if (/^4-pk_/i.test(s)) return "pack_bagels";
  if (/qt_/i.test(s)) return "Qt_CC";
  if (/8oz_/i.test(s)) return "8oz_CC";
  return null;
}
