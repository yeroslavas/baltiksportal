"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionState = { error: string | null; success: string | null };

export async function savePricing(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const customerId = String(formData.get("customer_id") ?? "");
  if (!customerId) {
    return { error: "No customer selected.", success: null };
  }

  const admin = createAdminClient();

  const toUpsert: {
    customer_id: string;
    product_id: string;
    custom_price: number;
  }[] = [];
  const toClear: string[] = [];

  // Form fields are named `price_<productId>`. Empty -> clear override.
  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("price_")) continue;
    const productId = key.slice("price_".length);
    const value = String(rawValue).trim();

    if (value === "") {
      toClear.push(productId);
      continue;
    }

    const price = Number(value);
    // Number.isFinite rejects NaN AND Infinity (Number("Infinity") is finite-false
    // but not NaN, so it would otherwise slip through and poison every total).
    if (!Number.isFinite(price) || price < 0) {
      return {
        error: "All custom prices must be 0 or more (leave blank to clear).",
        success: null,
      };
    }
    toUpsert.push({
      customer_id: customerId,
      product_id: productId,
      custom_price: price,
    });
  }

  if (toUpsert.length > 0) {
    const { error } = await admin
      .from("customer_pricing")
      .upsert(toUpsert, { onConflict: "customer_id,product_id" });
    if (error) return { error: error.message, success: null };
  }

  if (toClear.length > 0) {
    const { error } = await admin
      .from("customer_pricing")
      .delete()
      .eq("customer_id", customerId)
      .in("product_id", toClear);
    if (error) return { error: error.message, success: null };
  }

  revalidatePath("/admin/pricing");
  return {
    error: null,
    success: `Saved pricing — ${toUpsert.length} custom, ${toClear.length} using base price.`,
  };
}
