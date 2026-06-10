"use client";

import { useActionState, useState } from "react";
import { updateSettings, type SettingsState } from "./actions";
import type { AppSettings } from "@/lib/settings";

const initialState: SettingsState = { error: null, success: null };

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function UtilitiesForm({ settings }: { settings: AppSettings }) {
  const [state, formAction, pending] = useActionState(
    updateSettings,
    initialState,
  );
  const [windows, setWindows] = useState<string[]>(
    settings.deliveryWindows.length ? settings.deliveryWindows : [""],
  );

  return (
    <form action={formAction} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-stone-900">Delivery pricing</h2>
          <p className="mt-1 text-sm text-stone-500">
            Delivery orders below the minimum are charged the fee. Pickup is
            always free, and customers with “waive delivery minimum” are exempt.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">
              Delivery fee ($)
            </label>
            <input
              name="delivery_fee"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={settings.deliveryFee}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">
              Delivery minimum ($)
            </label>
            <input
              name="delivery_minimum"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={settings.deliveryMinimum}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-stone-200 pt-6">
        <div>
          <h2 className="font-semibold text-stone-900">
            Delivery / pickup windows
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            The options you can assign to each customer (on their edit page).
          </p>
        </div>

        <div className="space-y-2">
          {windows.map((w, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                name="window"
                value={w}
                onChange={(e) =>
                  setWindows((prev) =>
                    prev.map((v, i) => (i === idx ? e.target.value : v)),
                  )
                }
                placeholder="e.g. 7:00–8:30 AM"
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={() =>
                  setWindows((prev) =>
                    prev.length > 1 ? prev.filter((_, i) => i !== idx) : [""],
                  )
                }
                className="text-sm font-medium text-stone-400 transition hover:text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setWindows((prev) => [...prev, ""])}
            className="text-sm font-medium text-brand-700 transition hover:underline"
          >
            + Add window
          </button>
        </div>
        <p className="text-xs text-stone-500">
          Removing a window won’t change customers already assigned it — it just
          stops appearing as an option.
        </p>
      </section>

      <section className="space-y-4 border-t border-stone-200 pt-6">
        <div>
          <h2 className="font-semibold text-stone-900">Business identity</h2>
          <p className="mt-1 text-sm text-stone-500">
            Printed at the top of every invoice PDF customers receive.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-stone-700">
            Business name
          </label>
          <input
            name="business_name"
            type="text"
            required
            defaultValue={settings.businessName}
            placeholder="Baltik's Bagel"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-stone-700">
            Business address
          </label>
          <textarea
            name="business_address"
            rows={3}
            defaultValue={settings.businessAddress}
            placeholder={"123 Main St\nBrooklyn, NY 11201"}
            className={`${inputClass} resize-y`}
          />
          <p className="text-xs text-stone-500">
            One line per row — appears under the business name on the invoice.
          </p>
        </div>
      </section>

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
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
