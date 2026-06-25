"use client";

import { useActionState, useEffect, useRef } from "react";
import { applyCredit, type CreditState } from "./actions";
import { submitOnEnter } from "@/lib/submit-on-enter";

const initial: CreditState = { error: null, success: null };

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

// Apply a credit/adjustment to an invoice. `amountDue` is the current balance,
// used as the input's max so a credit can't exceed what's owed.
export function ApplyCreditForm({
  id,
  amountDue,
}: {
  id: string;
  amountDue: number;
}) {
  const [state, action, pending] = useActionState(applyCredit, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} onKeyDown={submitOnEnter} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-stone-600">
            Credit amount
          </label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            max={amountDue}
            inputMode="decimal"
            placeholder="0.00"
            className={`${inputClass} w-32`}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-stone-600">Reason</label>
          <input
            name="reason"
            placeholder="e.g. 2 dozen short on delivery"
            className={`${inputClass} w-full`}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Applying…" : "Apply credit"}
        </button>
      </div>
      {state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : state.success ? (
        <p className="text-sm text-green-700">{state.success}</p>
      ) : null}
    </form>
  );
}
