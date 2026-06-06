"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionState = { error: string | null; success: string | null };

type OrderRow = { id: string; sort_order: number | null };

// Map a position choice ("start" | "end" | a product id to insert after) to a
// numeric sort_order. numeric lets us slot between neighbours (e.g. 5.5).
function computeSortOrder(position: string, rows: OrderRow[]): number {
  const orders = rows
    .map((r) => r.sort_order)
    .filter((v): v is number => v != null);
  if (position === "start") return orders.length ? Math.min(...orders) - 1 : 1;
  if (position === "end" || !position)
    return orders.length ? Math.max(...orders) + 1 : 1;
  const target = rows.find((r) => r.id === position);
  if (!target || target.sort_order == null)
    return orders.length ? Math.max(...orders) + 1 : 1; // fall back to end
  const base = target.sort_order;
  const after = orders.filter((v) => v > base);
  return after.length ? (base + Math.min(...after)) / 2 : base + 1;
}

export async function createProduct(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("name");
  const sku = get("sku");
  const description = get("description");
  const unit = get("unit") || "dozen";
  const basePriceRaw = get("base_price");
  const basePrice = Number(basePriceRaw.replace(/[$,\s]/g, ""));
  const reportCountRaw = get("report_count");
  const position = get("position") || "end"; // "start" | "end" | a product id

  if (!name) return { error: "Product name is required.", success: null };
  if (!sku) {
    return { error: "SKU is required — it's the product's unique key.", success: null };
  }
  if (!basePriceRaw || Number.isNaN(basePrice) || basePrice < 0) {
    return { error: "Enter a valid base price (0 or more).", success: null };
  }
  let reportCount: number | null = null;
  if (reportCountRaw) {
    if (!/^\d+$/.test(reportCountRaw)) {
      return { error: "Report count must be a whole number.", success: null };
    }
    reportCount = parseInt(reportCountRaw, 10);
  }

  const admin = createAdminClient();

  // SKU must be unique (matches the products_sku_key index).
  const { data: dup } = await admin
    .from("products")
    .select("id")
    .eq("sku", sku)
    .limit(1);
  if (dup && dup.length) {
    return { error: `A product with SKU "${sku}" already exists.`, success: null };
  }

  // Resolve catalog position into a sort_order.
  const { data: rows } = await admin.from("products").select("id,sort_order");
  const sortOrder = computeSortOrder(position, rows ?? []);

  const { error } = await admin.from("products").insert({
    sku,
    name,
    description: description || null,
    unit,
    base_price: basePrice,
    bake_time: get("bake_time") || null,
    product_type: get("product_type") || null,
    report_group: get("report_group") || null,
    report_unit: get("report_unit") || null,
    report_count: reportCount,
    sort_order: sortOrder,
    is_active: true,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `A product with SKU "${sku}" already exists.`, success: null };
    }
    return { error: error.message, success: null };
  }

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/catalog");
  return { error: null, success: `Added "${name}".` };
}

export async function updateProduct(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const id = get("id");
  if (!id) return { error: "Missing product id.", success: null };

  const name = get("name");
  const sku = get("sku");
  const basePriceRaw = get("base_price");
  const basePrice = Number(basePriceRaw.replace(/[$,\s]/g, ""));
  const reportCountRaw = get("report_count");
  const position = get("position") || "keep"; // "keep" | "start" | "end" | id

  if (!name) return { error: "Product name is required.", success: null };
  if (!sku) {
    return { error: "SKU is required — it's the product's unique key.", success: null };
  }
  if (!basePriceRaw || Number.isNaN(basePrice) || basePrice < 0) {
    return { error: "Enter a valid base price (0 or more).", success: null };
  }
  let reportCount: number | null = null;
  if (reportCountRaw) {
    if (!/^\d+$/.test(reportCountRaw)) {
      return { error: "Report count must be a whole number.", success: null };
    }
    reportCount = parseInt(reportCountRaw, 10);
  }

  const admin = createAdminClient();

  // SKU must stay unique — exclude this product from the check.
  const { data: dup } = await admin
    .from("products")
    .select("id")
    .eq("sku", sku)
    .neq("id", id)
    .limit(1);
  if (dup && dup.length) {
    return { error: `Another product already uses SKU "${sku}".`, success: null };
  }

  const update: Record<string, unknown> = {
    sku,
    name,
    description: get("description") || null,
    unit: get("unit") || "dozen",
    base_price: basePrice,
    bake_time: get("bake_time") || null,
    product_type: get("product_type") || null,
    report_group: get("report_group") || null,
    report_unit: get("report_unit") || null,
    report_count: reportCount,
  };

  // Only recompute position if the admin chose to move it.
  if (position !== "keep") {
    const { data: rows } = await admin
      .from("products")
      .select("id,sort_order")
      .neq("id", id);
    update.sort_order = computeSortOrder(position, rows ?? []);
  }

  const { error } = await admin.from("products").update(update).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { error: `Another product already uses SKU "${sku}".`, success: null };
    }
    return { error: error.message, success: null };
  }

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/catalog");
  revalidatePath(`/admin/products/${id}/edit`);
  return { error: null, success: `Saved changes to "${name}".` };
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
