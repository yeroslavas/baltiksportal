"use client";

import { useActionState } from "react";
import Link from "next/link";
import { duplicateCustomer, type ActionState } from "../../actions";
import { PhoneInput } from "@/components/phone-input";
import { submitOnEnter } from "@/lib/submit-on-enter";

const initialState: ActionState = { error: null, success: null };

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function DuplicateCustomerForm({
  sourceId,
  defaultBusinessName,
}: {
  sourceId: string;
  defaultBusinessName: string;
}) {
  const [state, formAction, pending] = useActionState(
    duplicateCustomer,
    initialState,
  );

  return (
    <form
      action={formAction}
      onKeyDown={submitOnEnter}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <input type="hidden" name="source_id" value={sourceId} />

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">
          Business name *
        </label>
        <input
          name="business_name"
          required
          defaultValue={defaultBusinessName}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">
          Login email *
        </label>
        <input name="email" type="email" required className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">
          Temp password *
        </label>
        <input
          name="password"
          type="text"
          required
          minLength={8}
          placeholder="min 8 characters"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Contact name</label>
        <input name="contact_name" className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Phone</label>
        <PhoneInput name="phone" className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">Address</label>
        <input name="address" className={inputClass} />
      </div>

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 sm:col-span-2">
          {state.success}{" "}
          <Link href="/admin/customers" className="font-medium underline">
            Back to customers
          </Link>
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending || Boolean(state.success)}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Duplicating…" : "Create duplicate"}
        </button>
      </div>
    </form>
  );
}
