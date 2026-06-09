import { requireUser, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { CustomerHeader } from "@/components/customer-header";
import { CheckoutView } from "./checkout-view";

export default async function CheckoutPage() {
  const user = await requireUser();
  const settings = await getSettings();
  // Service-role read, scoped to this user — waive_delivery_minimum is an
  // internal column the customer's own API key can't see.
  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("business_name, waive_delivery_minimum, delivery_window")
    .eq("user_id", user.id)
    .maybeSingle<{
      business_name: string;
      waive_delivery_minimum: boolean;
      delivery_window: string | null;
    }>();

  return (
    <div className="flex flex-1 flex-col">
      <CustomerHeader
        label={customer?.business_name ?? user.email ?? ""}
        isAdminUser={isAdmin(user.email)}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Review &amp; place order
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Check everything over, then confirm to submit your order.
        </p>
        <CheckoutView
          waiveDeliveryMinimum={customer?.waive_delivery_minimum ?? false}
          deliveryWindow={customer?.delivery_window ?? null}
          deliveryFee={settings.deliveryFee}
          deliveryMinimum={settings.deliveryMinimum}
        />
      </main>
    </div>
  );
}
