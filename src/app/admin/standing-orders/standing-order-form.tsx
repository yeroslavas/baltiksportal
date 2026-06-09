"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null, success: null };

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

const WEEKDAYS = [
  { iso: 1, label: "Mon" },
  { iso: 2, label: "Tue" },
  { iso: 3, label: "Wed" },
  { iso: 4, label: "Thu" },
  { iso: 5, label: "Fri" },
  { iso: 6, label: "Sat" },
  { iso: 7, label: "Sun" },
];

export type StandingOrderInitial = {
  id: string;
  customerName: string;
  fulfillmentType: "delivery" | "pickup";
  daysOfWeek: number[];
  intervalWeeks: number;
  anchorDate: string;
  endDate: string | null;
  leadDays: number;
  isActive: boolean;
  skipDates: string[];
  note: string | null;
  items: Record<string, number>; // productId -> quantity
};

export function StandingOrderForm({
  mode,
  action,
  products,
  customers,
  initial,
}: {
  mode: "create" | "edit";
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  products: { id: string; name: string; unit: string }[];
  customers?: { id: string; business_name: string }[];
  initial?: StandingOrderInitial;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [skips, setSkips] = useState<string[]>(initial?.skipDates ?? []);

  return (
    <form action={formAction} className="space-y-8">
      {mode === "edit" && initial ? (
        <input type="hidden" name="id" value={initial.id} />
      ) : null}

      {/* Customer + fulfillment */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-stone-700">Customer *</label>
          {mode === "create" ? (
            <select name="customer_id" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select a customer…
              </option>
              {(customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
              {initial?.customerName}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-stone-700">Fulfillment</label>
          <select
            name="fulfillment_type"
            defaultValue={initial?.fulfillmentType ?? "delivery"}
            className={inputClass}
          >
            <option value="delivery">Delivery</option>
            <option value="pickup">Pickup</option>
          </select>
        </div>
      </section>

      {/* Schedule */}
      <section className="space-y-4 border-t border-stone-200 pt-6">
        <h2 className="font-semibold text-stone-900">Schedule</h2>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Delivery weekdays *
          </span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const on = initial?.daysOfWeek.includes(d.iso) ?? false;
              return (
                <label
                  key={d.iso}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800"
                >
                  <input
                    type="checkbox"
                    name="day"
                    value={d.iso}
                    defaultChecked={on}
                    className="h-3.5 w-3.5 rounded border-stone-300 text-brand-600 focus:ring-2 focus:ring-brand-200"
                  />
                  {d.label}
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">Frequency</label>
            <select
              name="interval_weeks"
              defaultValue={String(initial?.intervalWeeks ?? 1)}
              className={inputClass}
            >
              <option value="1">Weekly</option>
              <option value="2">Every other week</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">
              Start date *
            </label>
            <input
              type="date"
              name="anchor_date"
              required
              defaultValue={initial?.anchorDate ?? ""}
              className={inputClass}
            />
            <p className="text-xs text-stone-500">
              Also sets the “every other week” rhythm.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">
              End date (optional)
            </label>
            <input
              type="date"
              name="end_date"
              defaultValue={initial?.endDate ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">
              Create orders this many days ahead
            </label>
            <input
              type="number"
              name="lead_days"
              min={0}
              max={14}
              defaultValue={initial?.leadDays ?? 3}
              className={inputClass}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={initial?.isActive ?? true}
                className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-2 focus:ring-brand-200"
              />
              <span className="text-sm font-medium text-stone-700">
                Active (generating orders)
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* Skip dates */}
      <section className="space-y-3 border-t border-stone-200 pt-6">
        <div>
          <h2 className="font-semibold text-stone-900">Skip dates</h2>
          <p className="mt-1 text-sm text-stone-500">
            Holidays/closures to skip. If an order for that date was already
            created, it’ll be canceled.
          </p>
        </div>
        <div className="space-y-2">
          {skips.map((s, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="date"
                name="skip"
                value={s}
                onChange={(e) =>
                  setSkips((prev) =>
                    prev.map((v, i) => (i === idx ? e.target.value : v)),
                  )
                }
                className={inputClass}
              />
              <button
                type="button"
                onClick={() =>
                  setSkips((prev) => prev.filter((_, i) => i !== idx))
                }
                className="text-sm font-medium text-stone-400 transition hover:text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSkips((prev) => [...prev, ""])}
            className="text-sm font-medium text-brand-700 transition hover:underline"
          >
            + Add skip date
          </button>
        </div>
      </section>

      {/* Items */}
      <section className="space-y-3 border-t border-stone-200 pt-6">
        <div>
          <h2 className="font-semibold text-stone-900">Items</h2>
          <p className="mt-1 text-sm text-stone-500">
            Set a quantity for each product in the standing order; leave the rest
            blank. Prices are applied automatically when each order is created.
          </p>
        </div>
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200">
          {products.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-4 bg-white px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-stone-700">
                {p.name}
                <span className="text-stone-400"> · {p.unit}</span>
              </span>
              <input
                type="number"
                min={0}
                name={`qty:${p.id}`}
                defaultValue={initial?.items[p.id] ?? ""}
                placeholder="0"
                aria-label={`Quantity of ${p.name}`}
                className="w-20 rounded-lg border border-stone-300 px-2 py-1.5 text-right text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-1.5 border-t border-stone-200 pt-6">
        <label className="text-sm font-medium text-stone-700">Note (optional)</label>
        <input
          name="note"
          defaultValue={initial?.note ?? ""}
          placeholder="Internal note about this standing order"
          className={inputClass}
        />
      </div>

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending
          ? "Saving…"
          : mode === "create"
            ? "Create standing order"
            : "Save changes"}
      </button>
    </form>
  );
}
