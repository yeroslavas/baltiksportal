import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhone } from "@/lib/format";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/pagination";
import type { Customer } from "@/lib/types";
import { CreateCustomerForm } from "./create-customer-form";
import { ResetPasswordForm } from "./reset-password-form";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);

  const admin = createAdminClient();
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;
  const { data, count } = await admin
    .from("customers")
    .select("*", { count: "exact" })
    .order("business_name")
    .range(from, to);
  const customers = (data ?? []) as Customer[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  if (customers.length === 0 && total > 0 && page > totalPages) {
    redirect(`/admin/customers?page=${totalPages}`);
  }

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
          All customers ({total})
        </h2>
        {total === 0 ? (
          <p className="px-6 py-8 text-sm text-stone-500">No customers yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
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
                  <td className="px-6 py-3 text-stone-600">
                    {c.phone ? formatPhone(c.phone) : "—"}
                  </td>
                  <td className="px-6 py-3 align-top text-right">
                    <div className="flex flex-col items-end gap-2">
                      <Link
                        href={`/admin/customers/${c.id}/edit`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/pricing?customer=${c.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Set pricing
                      </Link>
                      <ResetPasswordForm userId={c.user_id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/customers"
      />
    </div>
  );
}
