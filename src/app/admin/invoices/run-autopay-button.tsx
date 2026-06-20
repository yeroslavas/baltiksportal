"use client";

import { useActionState } from "react";
import { runAutopayNow, type RunAutopayState } from "./actions";

const initial: RunAutopayState = { message: null, error: null };

export function RunAutopayButton() {
  const [state, action, pending] = useActionState(runAutopayNow, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-60"
      >
        {pending ? "Charging…" : "Run auto-pay now"}
      </button>
      {state.error ? (
        <span className="text-sm text-red-600">{state.error}</span>
      ) : state.message ? (
        <span className="text-sm text-green-700">{state.message}</span>
      ) : null}
    </form>
  );
}
