import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomerHeader } from "@/components/customer-header";
import { ClearCart } from "./clear-cart";

export default async function CheckoutSuccessPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("business_name")
    .eq("user_id", user.id)
    .maybeSingle<{ business_name: string }>();

  return (
    <div className="flex flex-1 flex-col">
      <CustomerHeader
        label={customer?.business_name ?? user.email ?? ""}
        isAdminUser={isAdmin(user.email)}
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
        <ClearCart />
        <div className="rounded-2xl border border-green-200 bg-green-50 px-6 py-10 text-center">
          <h1 className="text-2xl font-bold text-green-900">
            Payment received — thank you!
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-green-800">
            Your payment was submitted and your order is being placed — it&apos;ll
            show up in your order history shortly. Card payments confirm right
            away; bank (ACH) transfers can take a few business days to fully
            clear, but your order is confirmed.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/orders"
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              View orders
            </Link>
            <Link
              href="/catalog"
              className="rounded-lg border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            >
              Back to catalog
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
