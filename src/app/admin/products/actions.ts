"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionState = { error: string | null; success: string | null };

export async function createProduct(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim() || "dozen";
  const basePriceRaw = String(formData.get("base_price") ?? "").trim();
  const basePrice = Number(basePriceRaw);

  if (!name) {
    return { error: "Product name is required.", success: null };
  }
  if (!basePriceRaw || Number.isNaN(basePrice) || basePrice < 0) {
    return { error: "Enter a valid base price (0 or more).", success: null };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("products").insert({
    name,
    description: description || null,
    unit,
    base_price: basePrice,
    is_active: true,
  });

  if (error) return { error: error.message, success: null };

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { error: null, success: `Added "${name}".` };
}

export async function toggleProductActive(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("products").update({ is_active: !isActive }).eq("id", id);

  revalidatePath("/admin/products");
}
