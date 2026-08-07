"use client";

import { useActionState } from "react";
import { updateCustomer, type ActionState } from "../../actions";
import { PhoneInput } from "@/components/phone-input";
import { submitOnEnter } from "@/lib/submit-on-enter";
import type { Customer } from "@/lib/types";

const initialState: ActionState = { error: null, success: null };

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function EditCustomerForm({
  customer,
  deliveryWindows,
}: {
  customer: Customer;
  deliveryWindows: string[];
}) {
  const [state, formAction, pending] = useActionState(
    updateCustomer,
    initialState,
  );

  return (
    <form
      action={formAction}
      onKeyDown={submitOnEnter}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={customer.id} />

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">
          Business name *
        </label>
        <input
          name="business_name"
          required
          defaultValue={customer.business_name}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">
          Login email *
        </label>
        <input
          name="email"
          type="email"
          required
          defaultValue={customer.email ?? ""}
          className={inputClass}
        />
        <p className="text-xs text-stone-500">
          This is the customer&apos;s sign-in email. Changing it updates their
          login — pricing and history stay intact. Consider resetting their
          password and letting the new contact know.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Contact name</label>
        <input
          name="contact_name"
          defaultValue={customer.contact_name ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Phone</label>
        <PhoneInput
          name="phone"
          defaultValue={customer.phone ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">Address</label>
        <input
          name="address"
          defaultValue={customer.address ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">
          Delivery / pickup window
        </label>
        <select
          name="delivery_window"
          defaultValue={customer.delivery_window ?? ""}
          className={inputClass}
        >
          <option value="">— none assigned —</option>
          {/* Include the customer's current window even if it's no longer an
              offered option, so saving doesn't silently drop it. */}
          {(customer.delivery_window &&
          !deliveryWindows.includes(customer.delivery_window)
            ? [customer.delivery_window, ...deliveryWindows]
            : deliveryWindows
          ).map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <p className="text-xs text-stone-500">
          Used for this customer&apos;s orders at checkout.
        </p>
      </div>

      <div className="mt-2 border-t border-stone-200 pt-4 sm:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Internal (not shown to the customer)
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Sales rep</label>
        <input
          name="sales_rep"
          defaultValue={customer.sales_rep ?? ""}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Tier</label>
        <input
          name="tier"
          defaultValue={customer.tier ?? ""}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">Notes</label>
        <input
          name="notes"
          defaultValue={customer.notes ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-2 sm:col-span-2">
        <input
          id="waive_delivery_minimum"
          type="checkbox"
          name="waive_delivery_minimum"
          defaultChecked={customer.waive_delivery_minimum}
          className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-2 focus:ring-brand-200"
        />
        <label
          htmlFor="waive_delivery_minimum"
          className="text-sm font-medium text-stone-700"
        >
          Waive delivery minimum (free delivery — no $99 minimum / $15.99 fee)
        </label>
      </div>

      <div className="flex items-center gap-2 sm:col-span-2">
        <input
          id="allow_invoicing"
          type="checkbox"
          name="allow_invoicing"
          defaultChecked={customer.allow_invoicing}
          className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-2 focus:ring-brand-200"
        />
        <label
          htmlFor="allow_invoicing"
          className="text-sm font-medium text-stone-700"
        >
          Allow invoicing (pay by invoice instead of upfront)
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">
          Payment terms (days)
        </label>
        <input
          name="invoice_terms_days"
          type="number"
          min="0"
          max="365"
          step="1"
          required
          defaultValue={customer.invoice_terms_days}
          className={inputClass}
        />
        <p className="text-xs text-stone-500">
          Net days after issue an invoice is due (e.g. 7). Used when generating
          this customer&apos;s invoices.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">
          Slice fee (per dozen, USD)
        </label>
        <input
          name="slice_fee"
          type="number"
          min="0"
          step="0.01"
          defaultValue={customer.slice_fee}
          className={inputClass}
        />
        <p className="text-xs text-stone-500">
          Negotiated per-dozen charge added when this customer orders a sliceable
          item sliced. 0 = no slice fee.
        </p>
      </div>

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 sm:col-span-2">
          {state.success}
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
