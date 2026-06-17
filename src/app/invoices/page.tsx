import { redirect } from "next/navigation";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomerHeader } from "@/components/customer-header";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/pagination";
import { InvoicePayList } from "./invoice-pay-list";
import type { Invoice } from "@/lib/types";

// The invoice list joins each invoice's order to show the order date alongside
// the due date (the order's placement is the date a customer recognizes).
type InvoiceRow = Invoice & { orders: { order_date: string } | null };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; paid?: string; payerror?: string }>;
}) {
  const {
    page: pageParam,
    paid,
    payerror,
  } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);

  const user = await requireUser();
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("business_name")
    .eq("user_id", user.id)
    .maybeSingle<{ business_name: string }>();

  // RLS limits this to the signed-in customer's own invoices.
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;
  const { data, count } = await supabase
    .from("invoices")
    .select("*, orders(order_date)", { count: "exact" })
    .order("issue_date", { ascending: false })
    .order("invoice_number", { ascending: false })
    .range(from, to);
  const invoices = (data ?? []) as InvoiceRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  if (invoices.length === 0 && total > 0 && page > totalPages) {
    redirect(`/invoices?page=${totalPages}`);
  }

  return (
    <div className="flex flex-1 flex-col">
      <CustomerHeader
        label={customer?.business_name ?? user.email ?? ""}
        isAdminUser={isAdmin(user.email)}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Invoices
        </h1>

        {payerror ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
            <p className="font-semibold">We couldn&apos;t start the payment.</p>
            <p className="mt-1 break-words">{payerror}</p>
          </div>
        ) : paid === "1" ? (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
            <p className="font-semibold">Thank you — your payment was submitted.</p>
            <p>
              Bank (ACH) transfers can take a few business days to clear. Paid
              invoices update here once confirmed.
            </p>
          </div>
        ) : null}

        {total === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">
            No invoices yet. They appear here once an order is placed.
          </div>
        ) : (
          <>
            <InvoicePayList
              invoices={invoices.map((inv) => ({
                id: inv.id,
                invoice_number: inv.invoice_number,
                total_amount: Number(inv.total_amount),
                status: inv.status,
                due_date: inv.due_date,
                order_date: inv.orders?.order_date ?? null,
              }))}
            />
            <Pagination page={page} totalPages={totalPages} basePath="/invoices" />
          </>
        )}
      </main>
    </div>
  );
}
