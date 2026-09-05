import { formatPrice, formatDateOnly } from "@/lib/format";
import { sheetsConfigured, sheetsConfigSummary } from "@/lib/google-sheets";
import { getSyncStatus } from "@/lib/orders-export";
import { getInsights } from "@/lib/reporting-insights";
import { SyncSheetButton } from "./sync-sheet-button";

export const dynamic = "force-dynamic";

const cardClass = "rounded-xl border border-stone-200 bg-stone-50 px-4 py-3";
// Revenue-breakdown slice colors from the brand palette (logo navy + peach).
// Order: Dozens, Packs, Cream cheese, Delivery fees. `text` is the on-slice
// label color, chosen for contrast against `fill`.
const RB_COLORS = [
  { fill: "#305277", text: "#ffffff" }, // brand navy
  { fill: "#87a9cf", text: "#1f354c" }, // brand-300 (light blue)
  { fill: "#f6c2b1", text: "#1f354c" }, // peach
  { fill: "#1f354c", text: "#ffffff" }, // brand-800 (deep navy)
];
// Channel donut: Foodservice vs Retail.
const CH_COLORS = [
  { fill: "#305277", text: "#ffffff" }, // Foodservice — brand navy
  { fill: "#f6c2b1", text: "#1f354c" }, // Retail — peach
];
const DONUT_SIZE = 168;
const DONUT_STROKE = 34;
const DONUT_R = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_C = 2 * Math.PI * DONUT_R;
const DONUT_MID = DONUT_SIZE / 2;

// A labeled donut + legend for a revenue breakdown. Slices ≥5% are labeled on
// the ring; the legend lists every slice with its $ and %.
function DonutChart({
  title,
  data,
  colors,
}: {
  title: string;
  data: { label: string; value: number }[];
  colors: { fill: string; text: string }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
        {title}
      </h4>
      {total <= 0 ? (
        <p className="mt-3 text-sm text-stone-400">No revenue in this range.</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-6">
          <svg
            viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
            width={DONUT_SIZE}
            height={DONUT_SIZE}
            className="shrink-0"
            role="img"
            aria-label={title}
          >
            {data.map((b, i) => {
              const prior = data.slice(0, i).reduce((s, x) => s + x.value, 0);
              const frac = b.value / total;
              if (frac <= 0) return null;
              return (
                <circle
                  key={b.label}
                  cx={DONUT_MID}
                  cy={DONUT_MID}
                  r={DONUT_R}
                  fill="none"
                  stroke={colors[i].fill}
                  strokeWidth={DONUT_STROKE}
                  strokeDasharray={`${frac * DONUT_C} ${DONUT_C}`}
                  strokeDashoffset={-((prior / total) * DONUT_C)}
                  transform={`rotate(-90 ${DONUT_MID} ${DONUT_MID})`}
                />
              );
            })}
            {data.map((b, i) => {
              const prior = data.slice(0, i).reduce((s, x) => s + x.value, 0);
              const pct = (b.value / total) * 100;
              if (pct < 5) return null; // tiny slices stay in the legend only
              const mid = (prior + b.value / 2) / total;
              const ang = mid * 2 * Math.PI - Math.PI / 2;
              return (
                <text
                  key={b.label}
                  x={DONUT_MID + DONUT_R * Math.cos(ang)}
                  y={DONUT_MID + DONUT_R * Math.sin(ang)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="13"
                  fontWeight="600"
                  fill={colors[i].text}
                >
                  {Math.round(pct)}%
                </text>
              );
            })}
          </svg>
          <ul className="min-w-[200px] flex-1 space-y-2">
            {data.map((b, i) => {
              const pct = total > 0 ? (b.value / total) * 100 : 0;
              return (
                <li key={b.label} className="flex items-center gap-3 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ background: colors[i].fill }}
                  />
                  <span className="flex-1 text-stone-700">{b.label}</span>
                  <span className="font-medium text-stone-900">
                    {formatPrice(b.value)}
                  </span>
                  <span className="w-10 text-right text-stone-400">
                    {pct.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// Vertical bar chart of a per-weekday average (Mon…Sun). Shared by the bagels
// and dollars charts — only the data, bar color, and value format differ.
function WeekdayBars({
  title,
  data,
  max,
  colorClass,
  formatValue,
  footnote,
}: {
  title: string;
  data: { label: string; avg: number }[];
  max: number;
  colorClass: string;
  formatValue: (n: number) => string;
  footnote: string;
}) {
  // Sum of the per-weekday averages ≈ what a typical full week totals (distinct
  // from the range-total tiles above, which sum the whole selected period).
  const weekTotal = data.reduce((s, w) => s + w.avg, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-700">{title}</h3>
        <span
          className="shrink-0 text-xs text-stone-500"
          title="Sum of the daily averages — a typical full week"
        >
          Avg week:{" "}
          <span className="font-semibold text-stone-700">
            {formatValue(weekTotal)}
          </span>
        </span>
      </div>
      <div className="mt-3 flex h-40 items-end gap-2 border-b border-stone-200">
        {data.map((w) => {
          // Pixel height (not %) so bars render regardless of flex sizing.
          const px = w.avg > 0 ? Math.max(4, Math.round((w.avg / max) * 140)) : 0;
          return (
            <div
              key={w.label}
              className="flex flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="text-xs font-medium text-stone-600">
                {formatValue(w.avg)}
              </span>
              <div
                className={`w-full rounded-t ${colorClass}`}
                style={{ height: `${px}px` }}
                title={`${w.label}: ${formatValue(w.avg)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {data.map((w) => (
          <div
            key={w.label}
            className="flex-1 text-center text-xs text-stone-400"
          >
            {w.label}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-stone-400">{footnote}</p>
    </div>
  );
}
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
  const maxWeekdayDollars = Math.max(
    1,
    ...insights.weekdayDollars.map((w) => w.avg),
  );
  const maxCustomer = Math.max(1, ...insights.topCustomers.map((c) => c.total));

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

        <div>
          <h3 className="text-sm font-semibold text-stone-700">
            Top 5 customers by volume
          </h3>
          {insights.topCustomers.length === 0 ? (
            <p className="mt-2 text-sm text-stone-400">No orders in this range.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {insights.topCustomers.map((c, i) => (
                <li key={c.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-stone-700">
                      <span className="mr-1 text-stone-400">{i + 1}.</span>
                      {c.name}
                    </span>
                    <span className="shrink-0 font-semibold text-stone-900">
                      {formatPrice(c.total)}
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{
                        width: `${Math.max(2, Math.round((c.total / maxCustomer) * 100))}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <WeekdayBars
            title="Avg bagels delivered per weekday"
            data={insights.weekday}
            max={maxWeekday}
            colorClass="bg-brand-500"
            formatValue={(n) => n.toLocaleString()}
            footnote="Average per delivery day on that weekday, within the selected range."
          />
          <WeekdayBars
            title="Avg $ delivered per weekday"
            data={insights.weekdayDollars}
            max={maxWeekdayDollars}
            colorClass="bg-emerald-500"
            formatValue={(n) => `$${Math.round(n).toLocaleString()}`}
            footnote="Average $ per delivery day on that weekday, within the selected range."
          />
        </div>

        <div className="border-t border-stone-100 pt-5">
          <h3 className="text-sm font-semibold text-stone-700">
            Revenue breakdown
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
            <DonutChart
              title="By product"
              data={insights.revenueBreakdown}
              colors={RB_COLORS}
            />
            <DonutChart
              title="Foodservice vs Retail"
              data={insights.channelBreakdown}
              colors={CH_COLORS}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
