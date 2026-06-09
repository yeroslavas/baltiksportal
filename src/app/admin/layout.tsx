import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/app/login/actions";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/standing-orders", label: "Standing Orders" },
  { href: "/admin/invoices", label: "Invoices" },
  { href: "/admin/reporting", label: "Reporting" },
  { href: "/admin/utilities", label: "Utilities" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirects non-admins; this guards every /admin/* route.
  const user = await requireAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-brand-800 bg-brand-900 text-stone-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-2.5 font-semibold">
              <Image
                src="/baltiks-logo.webp"
                width={750}
                height={375}
                alt="Baltik's Bagel"
                priority
                className="h-7 w-auto"
              />
              <span className="text-stone-200">Admin</span>
            </span>
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-stone-300 transition hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-stone-400 sm:inline">{user.email}</span>
            <Link
              href="/catalog"
              className="text-stone-300 transition hover:text-white"
            >
              View catalog
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-brand-700 px-3 py-1.5 font-medium text-stone-200 transition hover:bg-brand-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
