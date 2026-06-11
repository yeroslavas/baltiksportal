"use client";

import { cancelOrder } from "./actions";

// Cancel control with a confirmation prompt — canceling voids the order's
// invoice, so it shouldn't fire on a stray click. Reversible via Reinstate.
export function CancelOrderButton({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  return (
    <form
      action={cancelOrder}
      onSubmit={(e) => {
        if (
          !confirm(
            "Cancel this order? Its invoice will be voided. You can reinstate it later.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className={
          className ?? "text-sm font-medium text-red-600 hover:underline"
        }
      >
        Cancel
      </button>
    </form>
  );
}
