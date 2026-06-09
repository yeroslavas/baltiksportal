"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessToday } from "@/lib/standing-orders";
import type { StandingOrder } from "@/lib/types";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Resolve the signed-in customer and verify they own this standing order.
async function authorize(standingOrderId: string) {
  const user = await getUser();
  if (!user || !standingOrderId) return null;
  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();
  if (!customer) return null;
  const { data: so } = await admin
    .from("standing_orders")
    .select("*")
    .eq("id", standingOrderId)
    .maybeSingle<StandingOrder>();
  if (!so || so.customer_id !== customer.id) return null;
  return { admin, so };
}

export async function customerSkipDate(formData: FormData): Promise<void> {
  const id = String(formData.get("standing_order_id") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!isDate(date)) return;
  const ctx = await authorize(id);
  if (!ctx) return;
  const { admin, so } = ctx;

  if (!so.skip_dates.includes(date)) {
    await admin
      .from("standing_orders")
      .update({ skip_dates: [...so.skip_dates, date].sort() })
      .eq("id", id);
  }
  // Cancel an already-generated order for that date (only if still pending).
  await admin
    .from("orders")
    .delete()
    .eq("standing_order_id", id)
    .eq("delivery_date", date)
    .eq("status", "pending");

  revalidatePath("/standing");
}

export async function customerUnskipDate(formData: FormData): Promise<void> {
  const id = String(formData.get("standing_order_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const ctx = await authorize(id);
  if (!ctx) return;
  const { admin, so } = ctx;

  // The order will be re-created on the next nightly run if still within its
  // lead window.
  await admin
    .from("standing_orders")
    .update({ skip_dates: so.skip_dates.filter((d) => d !== date) })
    .eq("id", id);

  revalidatePath("/standing");
}

export async function customerSetPaused(formData: FormData): Promise<void> {
  const id = String(formData.get("standing_order_id") ?? "");
  const paused = String(formData.get("paused") ?? "") === "true";
  const ctx = await authorize(id);
  if (!ctx) return;
  const { admin } = ctx;

  await admin
    .from("standing_orders")
    .update({ is_active: !paused })
    .eq("id", id);

  if (paused) {
    // Drop upcoming pending orders; processing/fulfilled ones are untouched.
    await admin
      .from("orders")
      .delete()
      .eq("standing_order_id", id)
      .eq("status", "pending")
      .gte("delivery_date", businessToday());
  }

  revalidatePath("/standing");
}
