// Admin-editable operational settings, backed by the single-row public.app_settings
// table. Read SERVER-SIDE only (service_role) — see the admin Utilities page for
// editing. Customer-facing pages receive the resolved values as plain props.

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type AppSettings = {
  deliveryFee: number;
  deliveryMinimum: number;
  deliveryWindows: string[];
  // Business identity printed at the top of invoice PDFs.
  businessName: string;
  businessAddress: string;
  // Next-day order cutoff (business timezone). When enabled, customers can't
  // order for tomorrow once the cutoff hour has passed — see src/lib/order-cutoff.ts.
  orderCutoffEnabled: boolean;
  orderCutoffHour: number; // 0–23
};

// Used until the row is read — and as a graceful fallback if the table/row is
// missing (e.g. before the migration is run). Keep in step with schema.sql.
export const DEFAULT_SETTINGS: AppSettings = {
  deliveryFee: 15.99,
  deliveryMinimum: 99,
  deliveryWindows: ["7:00–8:30 AM", "9:30–11:30 AM"],
  businessName: "Baltik's Bagel",
  businessAddress: "",
  orderCutoffEnabled: true,
  orderCutoffHour: 20,
};

// Request-memoized so several consumers in one render share a single read.
export const getSettings = cache(async (): Promise<AppSettings> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select(
      "delivery_fee, delivery_minimum, delivery_windows, business_name, business_address, order_cutoff_enabled, order_cutoff_hour",
    )
    .eq("id", 1)
    .maybeSingle<{
      delivery_fee: number;
      delivery_minimum: number;
      delivery_windows: string[] | null;
      business_name: string | null;
      business_address: string | null;
      order_cutoff_enabled: boolean | null;
      order_cutoff_hour: number | null;
    }>();
  if (!data) return DEFAULT_SETTINGS;
  return {
    deliveryFee: Number(data.delivery_fee),
    deliveryMinimum: Number(data.delivery_minimum),
    deliveryWindows: data.delivery_windows ?? DEFAULT_SETTINGS.deliveryWindows,
    businessName: data.business_name ?? DEFAULT_SETTINGS.businessName,
    businessAddress: data.business_address ?? DEFAULT_SETTINGS.businessAddress,
    orderCutoffEnabled:
      data.order_cutoff_enabled ?? DEFAULT_SETTINGS.orderCutoffEnabled,
    orderCutoffHour:
      data.order_cutoff_hour ?? DEFAULT_SETTINGS.orderCutoffHour,
  };
});
