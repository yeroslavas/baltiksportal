import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import type { Customer } from "@/lib/types";
import { EditCustomerForm } from "./edit-customer-form";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();
  const settings = await getSettings();

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
          Edit customer
        </h1>
        <p className="mt-1 text-sm text-stone-500">{customer.business_name}</p>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <EditCustomerForm
          customer={customer}
          deliveryWindows={settings.deliveryWindows}
        />
      </section>
    </div>
  );
}
