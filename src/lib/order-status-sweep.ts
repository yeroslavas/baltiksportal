// Automatic order-status transitions, driven hourly by the cron route. All time
// reasoning is in the business timezone. Forward-only and status-filtered, so it
// never touches canceled orders or anything an admin set manually beyond the
// expected step. Server-only (service_role). Pass `now` to test deterministically.

import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { businessToday, addDays } from "@/lib/standing-orders";
import { businessHour } from "@/lib/order-cutoff";

export type StatusSweepResult = {
  today: string;
  hour: number;
  cutoffHour: number;
  processed: number; // pending → processing
  fulfilled: number; // processing → fulfilled
};

export async function sweepOrderStatuses(
  now: Date = new Date(),
): Promise<StatusSweepResult> {
  const today = businessToday(now);
  const hour = businessHour(now);
  const settings = await getSettings();
  const admin = createAdminClient();

  let processed = 0;
  let fulfilled = 0;

  // pending → processing once the cutoff hour has passed: orders delivering
  // tomorrow lock in for prep the night before. "<= tomorrow" also self-heals
  // any still-pending order delivering today (e.g. if a run was missed).
  if (hour >= settings.orderCutoffHour) {
    const { data } = await admin
      .from("orders")
      .update({ status: "processing" })
      .eq("status", "pending")
      .lte("delivery_date", addDays(today, 1))
      .select("id");
    processed = data?.length ?? 0;
  }

  // processing → fulfilled from noon on the delivery day. Only advances orders
  // that reached "processing"; a still-pending order is left alone (visible).
  if (hour >= 12) {
    const { data } = await admin
      .from("orders")
      .update({ status: "fulfilled" })
      .eq("status", "processing")
      .lte("delivery_date", today)
      .select("id");
    fulfilled = data?.length ?? 0;
  }

  return {
    today,
    hour,
    cutoffHour: settings.orderCutoffHour,
    processed,
    fulfilled,
  };
}
