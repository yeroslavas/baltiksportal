import { sheetsConfigured } from "@/lib/google-sheets";
import { getSyncStatus } from "@/lib/orders-export";
import { SyncSheetButton } from "./sync-sheet-button";

export const dynamic = "force-dynamic";

export default async function AdminReportingPage() {
  const configured = sheetsConfigured();
  const { state, stale, ageLabel } = configured
    ? await getSyncStatus()
    : { state: null, stale: false, ageLabel: null };

  // Banner tone: not configured / failed / stale / fresh.
  let tone: "neutral" | "good" | "warn" | "bad" = "neutral";
  let headline = "Not connected yet";
  let detail =
    "Add the Google service-account credentials and Sheet ID to connect the production export.";
  if (configured) {
    if (!state) {
      tone = "warn";
      headline = "Connected — not yet synced";
      detail = "Click “Sync now”, or wait for the next hourly run.";
    } else if (!state.ok) {
      tone = "bad";
      headline = "Last sync failed";
      detail = state.error ?? "Unknown error.";
    } else if (stale) {
      tone = "warn";
      headline = `Sheet may be stale — last synced ${ageLabel}`;
      detail = `${state.rows} rows. The hourly sync hasn’t run recently; click “Sync now” to refresh.`;
    } else {
      tone = "good";
      headline = `Synced ${ageLabel}`;
      detail = `${state.rows} rows written. Refreshes automatically every hour.`;
    }
  }

  const toneClass = {
    neutral: "border-stone-200 bg-white text-stone-600",
    good: "border-green-200 bg-green-50 text-green-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    bad: "border-red-200 bg-red-50 text-red-800",
  }[tone];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Reporting
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Production export to Google Sheets, plus sales insights.
        </p>
      </div>

      {/* Production export to Google Sheets */}
      <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-stone-900">
              Production order export
            </h2>
            <p className="mt-1 max-w-xl text-sm text-stone-500">
              Every non-canceled order, one row per line item (with bake-unit
              counts), mirrored to Google Sheets for production pivots.
            </p>
          </div>
          <SyncSheetButton />
        </div>

        <div className={`rounded-xl border px-4 py-3 text-sm ${toneClass}`}>
          <p className="font-semibold">{headline}</p>
          <p className="mt-0.5 opacity-90">{detail}</p>
        </div>

        {!configured ? (
          <p className="text-xs text-stone-500">
            Set <code className="rounded bg-stone-100 px-1">GOOGLE_SHEETS_WEBHOOK_URL</code>{" "}
            and{" "}
            <code className="rounded bg-stone-100 px-1">GOOGLE_SHEETS_WEBHOOK_SECRET</code>{" "}
            in the environment, then redeploy.
          </p>
        ) : (
          <p className="text-xs text-stone-500">
            Don’t edit the exported data tab — it’s overwritten every sync. Build
            pivots and notes on separate tabs.
          </p>
        )}
      </section>

      {/* Sales insights — second reporting substream, not built yet. */}
      <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
        <span className="inline-flex items-center rounded-full bg-peach px-3 py-1 text-xs font-semibold text-brand-800">
          Coming soon
        </span>
        <p className="mx-auto mt-4 max-w-md text-sm text-stone-500">
          In-app sales insights — order volume, revenue by customer, and top
          products — land in the next reporting update.
        </p>
      </section>
    </div>
  );
}
