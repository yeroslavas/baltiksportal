import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhone } from "@/lib/format";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/pagination";
import { SortableHeader, type SortDir } from "@/components/sortable-header";
import type { Customer } from "@/lib/types";
import { CreateCustomerForm } from "./create-customer-form";
import { ResetPasswordForm } from "./reset-password-form";

const SORTS: Record<string, string> = {
  business: "business_name",
  contact: "contact_name",
  email: "email",
};

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    sort?: string;
    dir?: string;
    q?: string;
  }>;
}) {
  const {
    page: pageParam,
    sort: sortParam,
    dir: dirParam,
    q: qParam,
  } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const sort = sortParam && SORTS[sortParam] ? sortParam : "business";
  const dir: SortDir = dirParam === "desc" ? "desc" : "asc";
  const q = (qParam ?? "").trim().slice(0, 80);
  // Sanitize for a PostgREST or() filter — strip chars that break its grammar.
  const safeQ = q.replace(/[,()*%\\]/g, "");

  // Build a URL preserving sort + search, with overrides (undefined drops a key,
  // and page is never carried unless overridden, so a new search resets to p.1).
  const buildHref = (overrides: Record<string, string | undefined> = {}) => {
    const merged: Record<string, string | undefined> = {
      sort: sort !== "business" ? sort : undefined,
      dir: dir !== "asc" ? dir : undefined,
      q: q || undefined,
      ...overrides,
    };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/customers?${s}` : "/admin/customers";
  };
  const listParams: Record<string, string | undefined> = { q: q || undefined };

  const admin = createAdminClient();
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;
  let query = admin
    .from("customers")
    .select("*", { count: "exact" })
    .order(SORTS[sort], { ascending: dir === "asc" });
  if (safeQ) {
    query = query.or(
      `business_name.ilike.*${safeQ}*,contact_name.ilike.*${safeQ}*,email.ilike.*${safeQ}*`,
    );
  }
  const { data, count } = await query.range(from, to);
  const customers = (data ?? []) as Customer[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  if (customers.length === 0 && total > 0 && page > totalPages) {
    redirect(buildHref({ page: String(totalPages) }));
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

      <form
        method="get"
        action="/admin/customers"
        className="flex flex-wrap items-center gap-2"
      >
        {sort !== "business" ? (
          <input type="hidden" name="sort" value={sort} />
        ) : null}
        {dir !== "asc" ? <input type="hidden" name="dir" value={dir} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search business, contact, or email…"
          className="w-full max-w-xs rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Search
        </button>
        {q ? (
          <a
            href={buildHref({ q: undefined })}
            className="text-sm font-medium text-stone-500 transition hover:text-stone-700 hover:underline"
          >
            Clear
          </a>
        ) : null}
      </form>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-200 px-6 py-4 font-semibold text-stone-900">
          {q ? "Matching customers" : "All customers"} ({total})
          {q ? (
            <span className="font-normal text-stone-500"> · “{q}”</span>
          ) : null}
        </h2>
        {total === 0 ? (
          <p className="px-6 py-8 text-sm text-stone-500">
            {q ? "No customers match your search." : "No customers yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-stone-500">
              <tr className="border-b border-stone-200">
                <SortableHeader column="business" label="Business" sort={sort} dir={dir} basePath="/admin/customers" defaultDir="asc" extraParams={listParams} />
                <SortableHeader column="contact" label="Contact" sort={sort} dir={dir} basePath="/admin/customers" defaultDir="asc" extraParams={listParams} />
                <SortableHeader column="email" label="Email" sort={sort} dir={dir} basePath="/admin/customers" defaultDir="asc" extraParams={listParams} />
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
                      <Link
                        href={`/admin/customers/${c.id}/duplicate`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Duplicate
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
        query={{
          sort: sort !== "business" ? sort : undefined,
          dir: dir !== "asc" ? dir : undefined,
          ...listParams,
        }}
      />
    </div>
  );
}
