import type { SupabaseClient } from "@supabase/supabase-js";

// Resolving "which customer account is this login?" used to be an inline
// `.eq("user_id", user.id)` repeated in fifteen places. An account can now have
// SEVERAL logins (the person who orders is often not the person who pays), so
// that lookup goes through the customer_users membership table — and it lives
// here once, rather than being re-implemented per page.
//
// Works with both client types on purpose. The RLS-scoped client is already
// filtered by policy, but the server actions that use the service-role client
// bypass RLS entirely, so the filter has to be explicit either way.

// The account this login belongs to, or null if it isn't a customer login
// (an admin-only user, say).
export async function getCurrentCustomerId(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: link } = await client
    .from("customer_users")
    .select("customer_id")
    .eq("user_id", userId)
    .maybeSingle<{ customer_id: string }>();
  if (link?.customer_id) return link.customer_id;

  // TRANSITIONAL: fall back to the legacy one-login pointer. Mirrors the second
  // branch of current_customer_ids() in schema.sql, and exists so the app keeps
  // working if a membership row is ever missing (a customer created by an older
  // deploy, say). Remove both together once the admin Logins UI lands and
  // customers.user_id is dropped.
  const { data: legacy } = await client
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();
  return legacy?.id ?? null;
}

// The customer row for this login, selecting only the columns asked for.
//
// Callers must pass their columns: the `authenticated` role has COLUMN-level
// grants on customers (sales_rep/tier/notes are withheld), so a blanket
// select("*") would fail outright for customer-facing pages.
export async function getCurrentCustomer<T>(
  client: SupabaseClient,
  userId: string,
  columns: string,
): Promise<T | null> {
  const customerId = await getCurrentCustomerId(client, userId);
  if (!customerId) return null;
  const { data } = await client
    .from("customers")
    .select(columns)
    .eq("id", customerId)
    .maybeSingle<T>();
  return data ?? null;
}
