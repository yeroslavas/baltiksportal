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

export async function updateCustomer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const id = get("id");
  const businessName = get("business_name");
  const email = get("email").toLowerCase();

  if (!id) return { error: "Missing customer reference.", success: null };
  if (!businessName) {
    return { error: "Business name is required.", success: null };
  }
  if (!email) return { error: "Login email is required.", success: null };

  const admin = createAdminClient();

  // Need user_id (for the login) and the current email (to detect a change).
  const { data: existing } = await admin
    .from("customers")
    .select("user_id,email")
    .eq("id", id)
    .maybeSingle<{ user_id: string; email: string | null }>();
  if (!existing) return { error: "Customer not found.", success: null };

  // If the login email changed, update the auth user. The account, its pricing,
  // and its history all stay — only the sign-in credential changes.
  if (email !== (existing.email ?? "").toLowerCase()) {
    const { error: authError } = await admin.auth.admin.updateUserById(
      existing.user_id,
      { email, email_confirm: true },
    );
    if (authError) {
      const dup = /already|registered|exists|duplicate/i.test(authError.message);
      return {
        error: dup
          ? "That email is already used by another login."
          : authError.message,
        success: null,
      };
    }
  }

  // Update the profile (keep customers.email in sync with the login email).
  const { error: updateError } = await admin
    .from("customers")
    .update({
      business_name: businessName,
      contact_name: get("contact_name") || null,
      email,
      phone: get("phone") || null,
      address: get("address") || null,
      sales_rep: get("sales_rep") || null,
      tier: get("tier") || null,
      notes: get("notes") || null,
    })
    .eq("id", id);
  if (updateError) return { error: updateError.message, success: null };

  revalidatePath("/admin/customers");
  revalidatePath("/admin");
  revalidatePath(`/admin/customers/${id}/edit`);
  return { error: null, success: `Saved changes to ${businessName}.` };
}

export async function resetCustomerPassword(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin(); // defense in depth

  const userId = String(formData.get("user_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!userId) {
    return { error: "Missing customer reference.", success: null };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", success: null };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    return { error: error.message, success: null };
  }

  // No revalidate needed — nothing on the page changes. The admin reads the new
  // password from the still-filled field and passes it to the customer.
  return {
    error: null,
    success: "Password updated — copy it and send it to the customer.",
  };
}
