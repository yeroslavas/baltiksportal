import { startAutopaySetup, disableAutopay } from "@/app/invoices/autopay-actions";

// Customer self-service auto-pay control. `enabled` + `bankLast4` come from the
// customer row; the buttons are server-action forms that redirect to Stripe /
// back. Rendered on the invoices page.
export function AutopayCard({
  enabled,
  bankLast4,
}: {
  enabled: boolean;
  bankLast4: string | null;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-4">
      {enabled ? (
        <>
          <div className="min-w-0">
            <p className="font-medium text-stone-900">
              Auto-pay is on
              <span className="ml-2 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                Active
              </span>
            </p>
            <p className="mt-0.5 text-sm text-stone-500">
              {bankLast4 ? `Bank account ending ••${bankLast4}. ` : ""}
              Invoices are charged automatically on their due date.
            </p>
          </div>
          <form action={disableAutopay}>
            <button
              type="submit"
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            >
              Turn off
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="min-w-0">
            <p className="font-medium text-stone-900">Auto-pay your invoices</p>
            <p className="mt-0.5 text-sm text-stone-500">
              Authorize your bank once — new invoices are paid automatically on
              their due date. Turn it off anytime.
            </p>
          </div>
          <form action={startAutopaySetup}>
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Set up auto-pay
            </button>
          </form>
        </>
      )}
    </div>
  );
}
