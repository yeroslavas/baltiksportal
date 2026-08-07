"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatPrice, formatDateOnly } from "@/lib/format";
import type { FulfillmentType } from "@/lib/types";
import { placeOrder } from "./actions";

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

const WEEKDAY_NAME = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const WEEKDAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ISO weekday (1=Mon … 7=Sun) of a "YYYY-MM-DD" string, timezone-safe.
function isoWeekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function CheckoutView({
  waiveDeliveryMinimum,
  deliveryWindow,
  deliveryFee: deliveryFeeRate,
  deliveryMinimum,
  sliceFee,
  cutoff,
  availableDays,
  requiresPayment,
}: {
  waiveDeliveryMinimum: boolean;
  deliveryWindow: string | null;
  deliveryFee: number;
  deliveryMinimum: number;
  // Customer's per-dozen slice fee (0 = none).
  sliceFee: number;
  // Next-day cutoff floor + label; null for admins or when the cutoff is off.
  cutoff: { earliestDate: string; label: string } | null;
  // Weekdays orders may be placed for (ISO 1–7); admins get all 7.
  availableDays: number[];
  // Customers without allow_invoicing must pay at checkout (order created on
  // successful payment) rather than being invoiced.
  requiresPayment: boolean;
}) {
  const { items, total, clear } = useCart();
  const router = useRouter();
  const [fulfillment, setFulfillment] = useState<FulfillmentType>("delivery");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">
        Your cart is empty.{" "}
        <Link
          href="/catalog"
          className="font-medium text-brand-700 hover:underline"
        >
          Browse the catalog
        </Link>
        .
      </div>
    );
  }

  const pickedWeekday = date ? isoWeekdayOf(date) : null;
  const dateClosed =
    pickedWeekday !== null &&
    availableDays.length > 0 &&
    !availableDays.includes(pickedWeekday);
  const closedDays = [1, 2, 3, 4, 5, 6, 7].filter(
    (d) => !availableDays.includes(d),
  );
  const ready = Boolean(date) && !dateClosed;
  const noun = fulfillment === "pickup" ? "Pickup" : "Delivery";
  const slicedQty = items.reduce(
    (s, i) => (i.allowSlicing && i.sliced ? s + i.quantity : s),
    0,
  );
  const slicingTotal = Math.round(sliceFee * slicedQty * 100) / 100;
  // Slicing counts toward the free-delivery minimum, like the goods.
  const deliveryFee =
    fulfillment === "delivery" &&
    !waiveDeliveryMinimum &&
    total + slicingTotal < deliveryMinimum
      ? deliveryFeeRate
      : 0;
  const grandTotal = total + deliveryFee + slicingTotal;

  async function confirm() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    const res = await placeOrder(
      items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        sliced: i.sliced,
      })),
      { type: fulfillment, date },
    );
    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    // Pay-first customers go to Stripe; the cart clears on the success page.
    if (res.checkoutUrl) {
      window.location.href = res.checkoutUrl;
      return;
    }
    clear();
    router.push(`/orders/${res.orderId}?placed=1`);
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
        <div>
          <p className="mb-2 text-sm font-medium text-stone-700">Fulfillment</p>
          <div className="inline-flex rounded-lg border border-stone-300 p-0.5">
            {(["delivery", "pickup"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setFulfillment(opt)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition ${
                  fulfillment === opt
                    ? "bg-brand-600 text-white"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">
              {noun} date *
            </label>
            <input
              type="date"
              required
              min={cutoff?.earliestDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
            {cutoff ? (
              <p className="text-xs text-stone-500">
                Next-day orders close at {cutoff.label} ET. Earliest available:{" "}
                {formatDateOnly(cutoff.earliestDate)}.
              </p>
            ) : null}
            {dateClosed && pickedWeekday ? (
              <p className="text-xs font-medium text-red-600">
                We&apos;re closed on {WEEKDAY_NAME[pickedWeekday - 1]}s — please
                pick another date.
              </p>
            ) : closedDays.length > 0 ? (
              <p className="text-xs text-stone-500">
                Closed: {closedDays.map((d) => WEEKDAY_ABBR[d - 1]).join(", ")}.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">
              {noun} window
            </label>
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
              {deliveryWindow ?? "To be confirmed by Baltik's"}
            </div>
          </div>
        </div>
      </section>

      <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
        {items.map((i) => (
          <li
            key={i.productId}
            className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-stone-700">
              {i.name} × {i.quantity}
              {i.allowSlicing && i.sliced ? (
                <span className="text-stone-400"> · sliced</span>
              ) : null}
            </span>
            <span className="font-medium text-stone-900">
              {formatPrice(i.unitPrice * i.quantity)}
            </span>
          </li>
        ))}
        {slicingTotal > 0 ? (
          <li className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-stone-700">
              Slice fee
            </span>
            <span className="font-medium text-stone-900">
              {formatPrice(slicingTotal)}
            </span>
          </li>
        ) : null}
      </ul>

      <div className="space-y-2 rounded-2xl border border-stone-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-500">Subtotal</span>
          <span className="text-stone-900">{formatPrice(total + slicingTotal)}</span>
        </div>
        {fulfillment === "delivery" ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-500">Delivery fee</span>
            <span className="text-stone-900">
              {deliveryFee > 0 ? formatPrice(deliveryFee) : "Free"}
            </span>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-stone-100 pt-2">
          <span className="text-sm font-medium text-stone-700">Total</span>
          <span className="text-xl font-bold text-stone-900">
            {formatPrice(grandTotal)}
          </span>
        </div>
      </div>
      {deliveryFee > 0 ? (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Delivery orders under {formatPrice(deliveryMinimum)} include a{" "}
          {formatPrice(deliveryFeeRate)} delivery fee — add{" "}
          {formatPrice(deliveryMinimum - total - slicingTotal)} more to waive it.
        </p>
      ) : fulfillment === "delivery" && waiveDeliveryMinimum ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
          Free delivery on your account — no minimum.
        </p>
      ) : null}
      <p className="text-xs text-stone-500">
        Final prices are confirmed at submission using your account pricing.
        {requiresPayment
          ? " Payment is required to place this order — you'll be taken to a secure bank-transfer payment page."
          : ""}
      </p>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <Link
          href="/cart"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to cart
        </Link>
        <button
          type="button"
          onClick={confirm}
          disabled={!ready || submitting}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting
            ? requiresPayment
              ? "Redirecting to payment…"
              : "Placing order…"
            : requiresPayment
              ? "Pay & place order"
              : "Confirm order"}
        </button>
      </div>
    </div>
  );
}
