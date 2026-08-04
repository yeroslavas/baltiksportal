import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Customer } from "@/lib/types";
import { DuplicateCustomerForm } from "./duplicate-customer-form";

export default async function DuplicateCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: customer } = await admin
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle<Customer>();

  if (!customer) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Customer not found
        </h1>
        <Link
          href="/admin/customers"
          className="font-medium text-brand-700 hover:underline"
        >
          ← Back to customers
        </Link>
      </div>
    );
  }

  const { count: priceCount } = await admin
    .from("customer_pricing")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id);
  const prices = priceCount ?? 0;

  const inherited: string[] = [];
  if (customer.tier) inherited.push(`tier “${customer.tier}”`);
  if (customer.delivery_window)
    inherited.push(`window “${customer.delivery_window}”`);
  inherited.push(`${customer.invoice_terms_days}-day terms`);
  if (customer.allow_invoicing) inherited.push("invoicing enabled");
  if (customer.waive_delivery_minimum) inherited.push("delivery minimum waived");
  if (customer.sales_rep) inherited.push(`rep “${customer.sales_rep}”`);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/customers"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to customers
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
          Duplicate customer
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Based on{" "}
          <span className="font-medium text-stone-700">
            {customer.business_name}
          </span>
        </p>
      </div>

      <div className="rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm text-stone-700">
        <p className="font-medium text-stone-900">What gets copied</p>
        <p className="mt-1">
          <span className="font-medium">
            {prices} custom price{prices === 1 ? "" : "s"}
          </span>
          {inherited.length > 0 ? <> · {inherited.join(" · ")}</> : null}
        </p>
        <p className="mt-2 text-stone-500">
          Enter a new business name, login email, and temporary password below.
          The source customer isn&apos;t changed.
        </p>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <DuplicateCustomerForm
          sourceId={customer.id}
          defaultBusinessName={`Copy of ${customer.business_name}`}
        />
      </section>
    </div>
  );
}
