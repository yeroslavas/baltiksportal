import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/app/login/actions";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/pricing", label: "Pricing" },
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
      <header className="border-b border-stone-200 bg-stone-900 text-stone-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 font-semibold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-base">
                🥯
              </span>
              Baltiks Admin
            </span>
            <nav className="flex items-center gap-4 text-sm">
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
                className="rounded-lg border border-stone-600 px-3 py-1.5 font-medium text-stone-200 transition hover:bg-stone-800"
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
