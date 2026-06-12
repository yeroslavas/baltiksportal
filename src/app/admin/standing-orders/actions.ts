"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateStandingOrders } from "@/lib/standing-orders-run";

export type ActionState = { error: string | null; success: string | null };

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

type Parsed = {
  fulfillmentType: "delivery" | "pickup";
  intervalWeeks: number;
  daysOfWeek: number[];
  anchorDate: string;
  endDate: string | null;
  leadDays: number;
  isActive: boolean;
  note: string | null;
  skipDates: string[];
  items: { productId: string; quantity: number }[];
};

// Shared parse + validate for both create and update.
function parseForm(formData: FormData): Parsed | { error: string } {
  const fulfillmentType =
    formData.get("fulfillment_type") === "pickup" ? "pickup" : "delivery";
  const intervalWeeks = formData.get("interval_weeks") === "2" ? 2 : 1;

  const daysOfWeek = [
    ...new Set(
      formData
        .getAll("day")
        .map((d) => parseInt(String(d), 10))
        .filter((n) => n >= 1 && n <= 7),
    ),
  ].sort((a, b) => a - b);
  if (daysOfWeek.length === 0) {
    return { error: "Pick at least one delivery weekday." };
  }

  const anchorDate = String(formData.get("anchor_date") ?? "").trim();
  if (!isDate(anchorDate)) return { error: "Choose a start date." };

  const endRaw = String(formData.get("end_date") ?? "").trim();
  const endDate = endRaw || null;
  if (endDate && !isDate(endDate)) return { error: "The end date is invalid." };
  if (endDate && endDate < anchorDate) {
    return { error: "The end date can't be before the start date." };
  }

  const leadDays = Math.min(
    14,
    Math.max(0, parseInt(String(formData.get("lead_days") ?? "3"), 10) || 3),
  );
  const isActive = formData.get("is_active") === "on";
  const note = String(formData.get("note") ?? "").trim() || null;

  const skipDates = [
    ...new Set(
      formData
        .getAll("skip")
        .map((s) => String(s).trim())
        .filter(isDate),
    ),
  ].sort();

  const items: { productId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty:")) continue;
    const quantity = Math.floor(Number(value));
    if (Number.isFinite(quantity) && quantity > 0) {
      items.push({ productId: key.slice(4), quantity });
    }
  }
  if (items.length === 0) {
    return { error: "Add at least one product with a quantity." };
  }

  return {
    fulfillmentType,
    intervalWeeks,
    daysOfWeek,
    anchorDate,
    endDate,
    leadDays,
    isActive,
    note,
    skipDates,
    items,
  };
}

const rowFromParsed = (p: Parsed) => ({
  fulfillment_type: p.fulfillmentType,
  days_of_week: p.daysOfWeek,
  interval_weeks: p.intervalWeeks,
  anchor_date: p.anchorDate,
  end_date: p.endDate,
  skip_dates: p.skipDates,
  is_active: p.isActive,
  lead_days: p.leadDays,
  note: p.note,
});

export async function createStandingOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const customerId = String(formData.get("customer_id") ?? "").trim();
  if (!customerId) return { error: "Choose a customer.", success: null };

  const parsed = parseForm(formData);
  if ("error" in parsed) return { error: parsed.error, success: null };

  const admin = createAdminClient();
  const { data: so, error } = await admin
    .from("standing_orders")
    .insert({ customer_id: customerId, ...rowFromParsed(parsed) })
    .select("id")
    .single();
  if (error || !so) {
    return { error: error?.message ?? "Could not create the standing order.", success: null };
  }

  const { error: itemsErr } = await admin
    .from("standing_order_items")
    .insert(
      parsed.items.map((i) => ({
        standing_order_id: so.id,
        product_id: i.productId,
        quantity: i.quantity,
      })),
    );
  if (itemsErr) {
    await admin.from("standing_orders").delete().eq("id", so.id);
    return { error: itemsErr.message, success: null };
  }

  revalidatePath("/admin/standing-orders");
  revalidatePath("/admin");
  redirect(`/admin/standing-orders/${so.id}/edit?created=1`);
}

export async function updateStandingOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing standing-order reference.", success: null };

  const parsed = parseForm(formData);
  if ("error" in parsed) return { error: parsed.error, success: null };

  const admin = createAdminClient();
  const { error } = await admin
    .from("standing_orders")
    .update(rowFromParsed(parsed))
    .eq("id", id);
  if (error) return { error: error.message, success: null };

  // Replace the line items wholesale.
  await admin.from("standing_order_items").delete().eq("standing_order_id", id);
  const { error: itemsErr } = await admin
    .from("standing_order_items")
    .insert(
      parsed.items.map((i) => ({
        standing_order_id: id,
        product_id: i.productId,
        quantity: i.quantity,
      })),
    );
  if (itemsErr) return { error: itemsErr.message, success: null };

  revalidatePath("/admin/standing-orders");
  revalidatePath(`/admin/standing-orders/${id}/edit`);
  return { error: null, success: "Standing order saved." };
}

export type GenerateState = { message: string | null; error: string | null };

// Run the nightly generator on demand (creates any orders due within their
// lead window). Idempotent — safe to run repeatedly.
export async function runGenerator(
  _prev: GenerateState,
  _formData: FormData,
): Promise<GenerateState> {
  await requireAdmin();
  const summary = await generateStandingOrders();

  const created = summary.created.length;
  let message =
    created > 0
      ? `Created ${created} order${created === 1 ? "" : "s"}.`
      : "No new orders were due.";
  const extra: string[] = [];
  if (summary.alreadyPresent) extra.push(`${summary.alreadyPresent} already existed`);
  if (summary.canceled.length) extra.push(`${summary.canceled.length} canceled`);
  if (summary.skippedLocked.length) {
    extra.push(`${summary.skippedLocked.length} skipped (overdue)`);
  }
  if (extra.length) message += ` (${extra.join(", ")})`;

  revalidatePath("/admin/standing-orders");
  revalidatePath("/admin/orders");
  revalidatePath("/admin");

  return {
    message,
    error: summary.errors.length
      ? `${summary.errors.length} error(s): ${summary.errors
          .map((e) => e.error)
          .join("; ")}`
      : null,
  };
}

// Plain form action (not useActionState) for the delete button.
export async function deleteStandingOrder(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (id) {
    const admin = createAdminClient();
    // Generated orders keep their history (orders.standing_order_id → null).
    await admin.from("standing_orders").delete().eq("id", id);
  }
  revalidatePath("/admin/standing-orders");
  revalidatePath("/admin");
  redirect("/admin/standing-orders");
}
