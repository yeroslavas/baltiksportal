// Server-only Stripe client with clean test/live switching. STRIPE_MODE selects
// which key set is used, so you keep both in env and flip one variable. Keys are
// read lazily so a missing key never breaks the build — only the request that
// needs Stripe.

import Stripe from "stripe";

export const STRIPE_MODE: "test" | "live" =
  process.env.STRIPE_MODE === "live" ? "live" : "test";

function secretKey(): string {
  const key =
    STRIPE_MODE === "live"
      ? process.env.STRIPE_SECRET_KEY_LIVE
      : process.env.STRIPE_SECRET_KEY_TEST;
  if (!key) {
    throw new Error(
      `Missing Stripe secret key for mode "${STRIPE_MODE}" — set STRIPE_SECRET_KEY_${STRIPE_MODE.toUpperCase()}.`,
    );
  }
  return key;
}

export function stripeWebhookSecret(): string {
  const secret =
    STRIPE_MODE === "live"
      ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
      : process.env.STRIPE_WEBHOOK_SECRET_TEST;
  if (!secret) {
    throw new Error(
      `Missing Stripe webhook secret for mode "${STRIPE_MODE}" — set STRIPE_WEBHOOK_SECRET_${STRIPE_MODE.toUpperCase()}.`,
    );
  }
  return secret;
}

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(secretKey());
  return _stripe;
}
