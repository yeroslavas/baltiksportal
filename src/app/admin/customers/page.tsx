import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Customer } from "@/lib/types";
import { CreateCustomerForm } from "./create-customer-form";

export default async function AdminCustomersPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("customers")
    .select("*")
    .order("business_name");
  const customers = (data ?? []) as Customer[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Customers
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Create wholesale accounts. Each customer signs in with the email and
          temporary password you set here.
        </p>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-stone-900">New customer</h2>
        <CreateCustomerForm />
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-200 px-6 py-4 font-semibold text-stone-900">
          All customers ({customers.length})
        </h2>
        {customers.length === 0 ? (
          <p className="px-6 py-8 text-sm text-stone-500">No customers yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-stone-500">
              <tr className="border-b border-stone-200">
                <th className="px-6 py-3">Business</th>
                <th className="px-6 py-3">Contact</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Phone</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-6 py-3 font-medium text-stone-900">
                    {c.business_name}
                  </td>
                  <td className="px-6 py-3 text-stone-600">
                    {c.contact_name ?? "—"}
                  </td>
                  <td className="px-6 py-3 text-stone-600">{c.email ?? "—"}</td>
                  <td className="px-6 py-3 text-stone-600">{c.phone ?? "—"}</td>
                  <td className="px-6 py-3 text-right">
                    <Link
                      href={`/admin/pricing?customer=${c.id}`}
                      className="font-medium text-amber-700 hover:underline"
                    >
                      Set pricing
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
