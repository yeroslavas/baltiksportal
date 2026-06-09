// Admin-editable operational settings, backed by the single-row public.app_settings
// table. Read SERVER-SIDE only (service_role) — see the admin Utilities page for
// editing. Customer-facing pages receive the resolved values as plain props.

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type AppSettings = {
  deliveryFee: number;
  deliveryMinimum: number;
  deliveryWindows: string[];
};

// Used until the row is read — and as a graceful fallback if the table/row is
// missing (e.g. before the migration is run). Keep in step with schema.sql.
export const DEFAULT_SETTINGS: AppSettings = {
  deliveryFee: 15.99,
  deliveryMinimum: 99,
  deliveryWindows: ["7:00–8:30 AM", "9:30–11:30 AM"],
};

// Request-memoized so several consumers in one render share a single read.
export const getSettings = cache(async (): Promise<AppSettings> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("delivery_fee, delivery_minimum, delivery_windows")
    .eq("id", 1)
    .maybeSingle<{
      delivery_fee: number;
      delivery_minimum: number;
      delivery_windows: string[] | null;
    }>();
  if (!data) return DEFAULT_SETTINGS;
  return {
    deliveryFee: Number(data.delivery_fee),
    deliveryMinimum: Number(data.delivery_minimum),
    deliveryWindows: data.delivery_windows ?? DEFAULT_SETTINGS.deliveryWindows,
  };
});
