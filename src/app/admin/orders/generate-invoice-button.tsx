"use client";

import { useActionState } from "react";
import {
  generateInvoiceForOrder,
  type GenerateInvoiceState,
} from "@/app/admin/invoices/actions";

const initialState: GenerateInvoiceState = { message: null, error: null };

// Shown on an order with no invoice yet — the admin-triggered generation path.
export function GenerateInvoiceButton({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(
    generateInvoiceForOrder,
    initialState,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="order_id" value={orderId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate invoice"}
      </button>
      {state.error ? (
        <span className="text-sm text-red-600">{state.error}</span>
      ) : state.message ? (
        <span className="text-sm text-green-700">{state.message}</span>
      ) : null}
    </form>
  );
}
