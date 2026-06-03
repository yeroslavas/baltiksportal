"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionState = { error: string | null; success: string | null };

export async function createCustomer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin(); // defense in depth

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const businessName = String(formData.get("business_name") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!email || !password || !businessName) {
    return {
      error: "Email, password, and business name are required.",
      success: null,
    };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", success: null };
  }

  const admin = createAdminClient();

  // 1) Create the auth user (no email confirmation needed — admin-provisioned).
  const { data: created, error: authError } = await admin.auth.admin.createUser(
    { email, password, email_confirm: true },
  );
  if (authError || !created.user) {
    return {
      error: authError?.message ?? "Could not create the auth user.",
      success: null,
    };
  }

  // 2) Create the linked customer profile.
  const { error: insertError } = await admin.from("customers").insert({
    user_id: created.user.id,
    business_name: businessName,
    contact_name: contactName || null,
    email,
    phone: phone || null,
    address: address || null,
  });

  if (insertError) {
    // Roll back the auth user so we don't leave an orphan login.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: insertError.message, success: null };
  }

  revalidatePath("/admin/customers");
  revalidatePath("/admin");
  return { error: null, success: `Created account for ${businessName}.` };
}
