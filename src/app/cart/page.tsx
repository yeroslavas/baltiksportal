import { requireUser, isAdmin } from "@/lib/auth";
import { getCurrentCustomer } from "@/lib/current-customer";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { CustomerHeader } from "@/components/customer-header";
import { OverdueBanner } from "@/components/overdue-banner";
import { CartView } from "./cart-view";

export default async function CartPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const supabase = await createClient();
  const customer = await getCurrentCustomer<{ business_name: string; slice_fee: number }>(
    supabase,
    user.id,
    "business_name, slice_fee",
  );

  return (
    <div className="flex flex-1 flex-col">
      <CustomerHeader
        label={customer?.business_name ?? user.email ?? ""}
        isAdminUser={isAdmin(user.email)}
      />
      <OverdueBanner />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Your cart
        </h1>
        <CartView
          deliveryFee={settings.deliveryFee}
          deliveryMinimum={settings.deliveryMinimum}
          sliceFee={Number(customer?.slice_fee ?? 0)}
        />
      </main>
    </div>
  );
}
