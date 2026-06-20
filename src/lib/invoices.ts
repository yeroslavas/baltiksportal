// Invoice creation and the overdue sweep. Server-only (uses the service_role
// key, which bypasses RLS) — never import from a client component. Invoice
// numbers, issue/due dates come from DB column defaults (see supabase/schema.sql),
// so we never set them here.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessToday, addDays } from "@/lib/standing-orders";

// What a customer actually owes on an invoice: total minus any admin credit,
// clamped at 0. The single source of truth for "amount due" — used by the
// payment flow, the PDF, the outstanding totals, and the customer views.
export function invoiceAmountDue(inv: {
  total_amount: number | string;
  credit_amount?: number | string | null;
}): number {
  const total = Number(inv.total_amount) || 0;
  const credit = Number(inv.credit_amount ?? 0) || 0;
  return Math.max(0, Math.round((total - credit) * 100) / 100);
}

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
  const termsDays = cust?.invoice_terms_days ?? 7;
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

// A customer's invoices that put them on "credit stop". An invoice qualifies if:
//   • status = 'overdue' — explicitly flagged (admin dropdown or nightly sweep),
//     which acts as an immediate manual hold regardless of the due date; or
//   • status = 'unpaid' AND its due date has passed — a live past-due check, so a
//     lapsed invoice locks the moment its due date passes, before any sweep runs.
// Drives both the order-placement lock (checkout + standing-order generation) and
// the customer "account on hold" banner.
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
    .or(`status.eq.overdue,and(status.eq.unpaid,due_date.lt.${today})`)
    .order("due_date");
  return data ?? [];
}
