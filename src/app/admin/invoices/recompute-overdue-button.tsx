"use client";

import { useActionState } from "react";
import { recomputeOverdue, type OverdueState } from "./actions";

const initialState: OverdueState = { message: null, error: null };

// Manually runs the overdue sweep (no cron yet) — flips unpaid, past-due
// invoices to "overdue".
export function RecomputeOverdueButton() {
  const [state, action, pending] = useActionState(
    recomputeOverdue,
    initialState,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-60"
      >
        {pending ? "Checking…" : "Update overdue now"}
      </button>
      {state.error ? (
        <span className="text-sm text-red-600">{state.error}</span>
      ) : state.message ? (
        <span className="text-sm text-green-700">{state.message}</span>
      ) : null}
    </form>
  );
}
