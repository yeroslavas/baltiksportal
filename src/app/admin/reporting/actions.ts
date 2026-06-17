"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { exportOrdersToSheet } from "@/lib/orders-export";

export type SyncResult = { message: string | null; error: string | null };

// Run the order → Google Sheets export on demand. Same idempotent full-replace
// as the hourly cron; safe to click repeatedly.
export async function syncSheetNow(
  _prev: SyncResult,
  _formData: FormData,
): Promise<SyncResult> {
  await requireAdmin();
  const state = await exportOrdersToSheet();
  revalidatePath("/admin/reporting");
  if (state.ok) {
    return { message: `Synced ${state.rows} row${state.rows === 1 ? "" : "s"} to the sheet.`, error: null };
  }
  return { message: null, error: state.error ?? "Sync failed." };
}
