// Auto-pay helpers. Server-only (service_role + Stripe secret). Customers
// authorize ACH once (saved on a persistent Stripe Customer); invoices then
// charge off-session on their due date (see the autopay cron / charge logic).

import "server-only";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Get (or lazily create + persist) the Stripe Customer for a portal customer.
// Today's one-off pay flows create throwaway Customers per session; auto-pay
// needs ONE stable Customer so the saved bank/mandate attaches to it.
export async function getOrCreateStripeCustomer(opts: {
  customerId: string;
  email: string | null;
  businessName: string;
}): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("customers")
    .select("stripe_customer_id")
    .eq("id", opts.customerId)
    .maybeSingle<{ stripe_customer_id: string | null }>();
  if (data?.stripe_customer_id) return data.stripe_customer_id;

  const created = await getStripe().customers.create({
    email: opts.email ?? undefined,
    name: opts.businessName,
    metadata: { portal_customer_id: opts.customerId },
  });
  await admin
    .from("customers")
    .update({ stripe_customer_id: created.id })
    .eq("id", opts.customerId);
  return created.id;
}
