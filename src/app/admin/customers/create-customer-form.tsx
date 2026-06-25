"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCustomer, type ActionState } from "./actions";
import { PhoneInput } from "@/components/phone-input";
import { submitOnEnter } from "@/lib/submit-on-enter";

const initialState: ActionState = { error: null, success: null };

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function CreateCustomerForm() {
  const [state, formAction, pending] = useActionState(
    createCustomer,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields after a successful create.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onKeyDown={submitOnEnter}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">
          Business name *
        </label>
        <input name="business_name" required className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Login email *</label>
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
          {pending ? "Creating…" : "Create customer"}
        </button>
      </div>
    </form>
  );
}
