"use client";

import { useActionState } from "react";
import { updateInvoiceNote, type NoteState } from "./actions";

const initialState: NoteState = { saved: false };

export function PaymentNoteForm({
  id,
  note,
}: {
  id: string;
  note: string | null;
}) {
  const [state, action, pending] = useActionState(
    updateInvoiceNote,
    initialState,
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-1 flex-col gap-1.5">
        <label
          htmlFor="payment_note"
          className="text-xs font-semibold uppercase tracking-wide text-stone-400"
        >
          Payment note (internal)
        </label>
        <input
          id="payment_note"
          name="payment_note"
          defaultValue={note ?? ""}
          placeholder="e.g. Check #1234 received in person"
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save note"}
      </button>
      {state.saved ? (
        <span className="pb-2 text-sm text-green-700">Saved</span>
      ) : null}
    </form>
  );
}
