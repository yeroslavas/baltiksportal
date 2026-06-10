"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type SettingsState = { error: string | null; success: string | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAdmin();

  const fee = Number(formData.get("delivery_fee"));
  if (!Number.isFinite(fee) || fee < 0) {
    return { error: "Delivery fee must be a number of 0 or more.", success: null };
  }
  const minimum = Number(formData.get("delivery_minimum"));
  if (!Number.isFinite(minimum) || minimum < 0) {
    return {
      error: "Delivery minimum must be a number of 0 or more.",
      success: null,
    };
  }

  // Collect the window inputs (same name), trim, drop blanks, de-dupe.
  const seen = new Set<string>();
  const windows: string[] = [];
  for (const raw of formData.getAll("window")) {
    const w = String(raw).trim();
    if (!w) continue;
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    windows.push(w);
  }

  // Business identity for invoice PDFs. Name is required (it heads every
  // invoice); address is optional.
  const businessName = String(formData.get("business_name") ?? "").trim();
  if (!businessName) {
    return { error: "Business name is required.", success: null };
  }
  const businessAddress = String(formData.get("business_address") ?? "").trim();

  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .update({
      delivery_fee: round2(fee),
      delivery_minimum: round2(minimum),
      delivery_windows: windows,
      business_name: businessName,
      business_address: businessAddress,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { error: error.message, success: null };

  // Pages that read these settings (dynamic, but revalidate to be safe).
  revalidatePath("/admin/utilities");
  revalidatePath("/checkout");
  revalidatePath("/cart");
  return { error: null, success: "Settings saved." };
}
