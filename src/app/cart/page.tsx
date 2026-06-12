import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { CustomerHeader } from "@/components/customer-header";
import { OverdueBanner } from "@/components/overdue-banner";
import { CartView } from "./cart-view";

export default async function CartPage() {
  const user = await requireUser();
  const settings = await getSettings();
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
      <OverdueBanner />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Your cart
        </h1>
        <CartView
          deliveryFee={settings.deliveryFee}
          deliveryMinimum={settings.deliveryMinimum}
        />
      </main>
    </div>
  );
}
