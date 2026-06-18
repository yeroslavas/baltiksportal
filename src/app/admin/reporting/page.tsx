import { formatPrice, formatDateOnly } from "@/lib/format";
import { sheetsConfigured, sheetsConfigSummary } from "@/lib/google-sheets";
import { getSyncStatus } from "@/lib/orders-export";
import { getInsights } from "@/lib/reporting-insights";
import { SyncSheetButton } from "./sync-sheet-button";

export const dynamic = "force-dynamic";

const cardClass = "rounded-xl border border-stone-200 bg-stone-50 px-4 py-3";
const slicerInput =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export default async function AdminReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const insights = await getInsights({ from, to });
  const maxWeekday = Math.max(1, ...insights.weekday.map((w) => w.avg));

  const configured = sheetsConfigured();
  const cfg = sheetsConfigSummary();
  const { state, stale, ageLabel } = configured
    ? await getSyncStatus()
    : { state: null, stale: false, ageLabel: null };

  // Banner tone: not configured / failed / stale / fresh.
  let tone: "neutral" | "good" | "warn" | "bad" = "neutral";
  let headline = "Not connected yet";
  let detail =
    "Add the Apps Script webhook URL and secret to connect the production export.";
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

        {/* Connection diagnostic — shows what the LIVE deployment actually reads,
            so a not-yet-redeployed env change or URL mismatch is obvious. */}
        <details className="text-xs text-stone-500">
          <summary className="cursor-pointer select-none font-medium">
            Connection details
          </summary>
          <dl className="mt-2 space-y-1">
            <div>
              <span className="text-stone-400">Webhook URL (live): </span>
              <span className="break-all font-mono text-stone-700">
                {cfg.url ?? "— not set —"}
              </span>
            </div>
            <div>
              <span className="text-stone-400">Secret: </span>
              <span className="font-mono text-stone-700">
                {cfg.secretSet ? cfg.secretHint : "— not set —"}
              </span>
            </div>
            <div>
              <span className="text-stone-400">Data tab: </span>
              <span className="font-mono text-stone-700">{cfg.tab}</span>
            </div>
          </dl>
          <p className="mt-2 text-stone-400">
            This reflects the current deployment’s env vars. If it doesn’t match
            what you set in Vercel, redeploy there to apply the change.
          </p>
        </details>
      </section>

      {/* Sales insights */}
      <section className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold text-stone-900">Sales insights</h2>
            <p className="mt-1 text-sm text-stone-500">
              Delivered {formatDateOnly(insights.from)} – {formatDateOnly(insights.to)}.
            </p>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-stone-600">From</label>
              <input
                type="date"
                name="from"
                defaultValue={insights.from}
                className={slicerInput}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-stone-600">To</label>
              <input
                type="date"
                name="to"
                defaultValue={insights.to}
                className={slicerInput}
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            >
              Apply
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-wide text-stone-400">
              Bagels delivered
            </p>
            <p className="mt-1 text-2xl font-bold text-stone-900">
              {insights.bagelsTotal.toLocaleString()}
            </p>
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-wide text-stone-400">
              Order volume
            </p>
            <p className="mt-1 text-2xl font-bold text-stone-900">
              {formatPrice(insights.revenueTotal)}
            </p>
          </div>
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-wide text-stone-400">Orders</p>
            <p className="mt-1 text-2xl font-bold text-stone-900">
              {insights.orderCount.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-stone-700">
              Top customers by volume
            </h3>
            {insights.topCustomers.length === 0 ? (
              <p className="mt-2 text-sm text-stone-400">No orders in this range.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {insights.topCustomers.map((c, i) => (
                  <li
                    key={c.name}
                    className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-stone-700">
                      <span className="mr-1 text-stone-400">{i + 1}.</span>
                      {c.name}
                    </span>
                    <span className="ml-3 shrink-0 font-semibold text-stone-900">
                      {formatPrice(c.total)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-stone-700">
              Avg bagels delivered per weekday
            </h3>
            <div className="mt-3 flex h-40 items-end gap-2 border-b border-stone-200">
              {insights.weekday.map((w) => {
                // Pixel height (not %) so bars render regardless of flex sizing.
                const px =
                  w.avg > 0
                    ? Math.max(4, Math.round((w.avg / maxWeekday) * 140))
                    : 0;
                return (
                  <div
                    key={w.label}
                    className="flex flex-1 flex-col items-center justify-end gap-1"
                  >
                    <span className="text-xs font-medium text-stone-600">
                      {w.avg.toLocaleString()}
                    </span>
                    <div
                      className="w-full rounded-t bg-brand-500"
                      style={{ height: `${px}px` }}
                      title={`${w.label}: ${w.avg.toLocaleString()}`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex gap-2">
              {insights.weekday.map((w) => (
                <div
                  key={w.label}
                  className="flex-1 text-center text-xs text-stone-400"
                >
                  {w.label}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-stone-400">
              Average per delivery day on that weekday, within the selected range.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
