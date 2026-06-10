import Link from "next/link";
import Image from "next/image";
import { logout } from "@/app/login/actions";
import { CartIndicator } from "@/app/catalog/cart-indicator";

// Shared header for the customer-facing pages (catalog, cart, checkout, orders).
export function CustomerHeader({
  label,
  isAdminUser,
}: {
  label: string;
  isAdminUser: boolean;
}) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <Link href="/catalog" className="flex min-w-0 items-center gap-3">
          <Image
            src="/baltiks-logo.webp"
            width={750}
            height={375}
            alt="Baltik's Bagel"
            priority
            className="h-9 w-auto shrink-0"
          />
          <div className="min-w-0 border-l border-stone-200 pl-3">
            <p className="text-[10px] font-medium uppercase tracking-wide leading-tight text-stone-400">
              Wholesale
            </p>
            <p className="truncate text-sm font-medium leading-tight text-stone-700">
              {label}
            </p>
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-4">
          <Link
            href="/catalog"
            className="hidden text-sm font-medium text-brand-700 hover:underline sm:inline"
          >
            Catalog
          </Link>
          <Link
            href="/orders"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Orders
          </Link>
          <Link
            href="/standing"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Standing
          </Link>
          <Link
            href="/invoices"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Invoices
          </Link>
          <CartIndicator />
          {isAdminUser ? (
            <Link
              href="/admin"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Admin
            </Link>
          ) : null}
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
