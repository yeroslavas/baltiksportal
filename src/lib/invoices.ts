// Invoice creation and the overdue sweep. Server-only (uses the service_role
// key, which bypasses RLS) — never import from a client component. Invoice
// numbers, issue/due dates come from DB column defaults (see supabase/schema.sql),
// so we never set them here.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessToday, addDays } from "@/lib/standing-orders";

export type CreateInvoiceResult = {
  // The new invoice's id, or null when one already existed (or on error).
  invoiceId: string | null;
  // "created" | "exists" | "error" — lets callers message precisely.
  outcome: "created" | "exists" | "error";
  error?: string;
};

// Create the invoice for an order. Idempotent: order_id is UNIQUE, so a repeat
// call (re-run generator, double submit, admin re-trigger) is a no-op rather
// than a duplicate. Pass an existing admin client to share the connection.
export async function createInvoiceForOrder(opts: {
  orderId: string;
  customerId: string;
  total: number;
  admin?: SupabaseClient;
}): Promise<CreateInvoiceResult> {
  const admin = opts.admin ?? createAdminClient();

  // Due date = issue date + this customer's net terms (days). Computed in the
  // business timezone for consistency with the rest of the app; falls back to
  // 30 days if the customer row is somehow missing the value.
  const { data: cust } = await admin
    .from("customers")
    .select("invoice_terms_days")
    .eq("id", opts.customerId)
    .maybeSingle<{ invoice_terms_days: number | null }>();
  const termsDays = cust?.invoice_terms_days ?? 30;
  const issueDate = businessToday();
  const dueDate = addDays(issueDate, termsDays);

  // ON CONFLICT (order_id) DO NOTHING. ignoreDuplicates means an existing row
  // yields no returned row — which we report as "exists" rather than an error.
  const { data, error } = await admin
    .from("invoices")
    .upsert(
      {
        order_id: opts.orderId,
        customer_id: opts.customerId,
        total_amount: opts.total,
        issue_date: issueDate,
        due_date: dueDate,
      },
      { onConflict: "order_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { invoiceId: null, outcome: "error", error: error.message };
  if (!data) return { invoiceId: null, outcome: "exists" };
  return { invoiceId: data.id, outcome: "created" };
}

// Mark every still-unpaid invoice whose due date has passed as "overdue".
// "Past due" means strictly before today in the business timezone (the due date
// itself is the last day to pay). Returns how many rows were flipped. Run nightly
// by the overdue-invoices cron, and on demand from the admin Invoices button.
export async function markOverdueInvoices(
  admin?: SupabaseClient,
): Promise<number> {
  const client = admin ?? createAdminClient();
  const today = businessToday();

  const { data, error } = await client
    .from("invoices")
    .update({ status: "overdue" })
    .eq("status", "unpaid")
    .lt("due_date", today)
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

// A customer's past-due invoices — the LIVE "overdue debt" check (due date has
// passed, still unpaid/overdue), independent of the nightly sweep so it's
// accurate the moment a due date lapses. Used to lock delinquent customers out
// of placing new orders (manual checkout + standing-order generation).
export async function getOverdueInvoices(
  customerId: string,
  admin?: SupabaseClient,
): Promise<
  { id: string; invoice_number: string; total_amount: number; due_date: string }[]
> {
  const client = admin ?? createAdminClient();
  const today = businessToday();
  const { data } = await client
    .from("invoices")
    .select("id, invoice_number, total_amount, due_date")
    .eq("customer_id", customerId)
    .in("status", ["unpaid", "overdue"])
    .lt("due_date", today)
    .order("due_date");
  return data ?? [];
}
