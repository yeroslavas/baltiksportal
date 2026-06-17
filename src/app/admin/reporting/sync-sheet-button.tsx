"use client";

import { useActionState } from "react";
import { syncSheetNow, type SyncResult } from "./actions";

const initialState: SyncResult = { message: null, error: null };

export function SyncSheetButton() {
  const [state, action, pending] = useActionState(syncSheetNow, initialState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {state.error ? (
        <span className="text-sm text-red-600">{state.error}</span>
      ) : state.message ? (
        <span className="text-sm text-green-700">{state.message}</span>
      ) : null}
    </form>
  );
}
