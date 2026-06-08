"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

export async function updateOrderStatus(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as OrderStatus;
  if (!id || !ORDER_STATUSES.includes(status)) return;

  const admin = createAdminClient();
  await admin.from("orders").update({ status }).eq("id", id);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
}
