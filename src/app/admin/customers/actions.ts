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

// Duplicate an existing customer: create a NEW login (new email + temp password)
// that inherits the source's account config (tier, delivery window, payment
// terms, invoicing flags, sales rep) AND its custom pricing. Identity fields
// (name, contact, phone, address) are entered fresh. The source is untouched.
export async function duplicateCustomer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const sourceId = get("source_id");
  const email = get("email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const businessName = get("business_name");

  if (!sourceId) return { error: "Missing source customer.", success: null };
  if (!email || !password || !businessName) {
    return {
      error: "Business name, login email, and temp password are required.",
      success: null,
    };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", success: null };
  }

  const admin = createAdminClient();

  // Load the source's account config to inherit.
  const { data: src } = await admin
    .from("customers")
    .select(
      "delivery_window, sales_rep, tier, waive_delivery_minimum, allow_invoicing, invoice_terms_days",
    )
    .eq("id", sourceId)
    .maybeSingle<{
      delivery_window: string | null;
      sales_rep: string | null;
      tier: string | null;
      waive_delivery_minimum: boolean;
      allow_invoicing: boolean;
      invoice_terms_days: number;
    }>();
  if (!src) return { error: "Source customer not found.", success: null };

  // 1) New auth user.
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !created.user) {
    const dup = /already|registered|exists|duplicate/i.test(
      authError?.message ?? "",
    );
    return {
      error: dup
        ? "That email is already used by another login."
        : (authError?.message ?? "Could not create the auth user."),
      success: null,
    };
  }

  // 2) New customer profile inheriting the source's config.
  const { data: newCust, error: insertError } = await admin
    .from("customers")
    .insert({
      user_id: created.user.id,
      business_name: businessName,
      contact_name: get("contact_name") || null,
      email,
      phone: get("phone") || null,
      address: get("address") || null,
      delivery_window: src.delivery_window,
      sales_rep: src.sales_rep,
      tier: src.tier,
      waive_delivery_minimum: src.waive_delivery_minimum,
      allow_invoicing: src.allow_invoicing,
      invoice_terms_days: src.invoice_terms_days,
    })
    .select("id")
    .single();
  if (insertError || !newCust) {
    // Roll back the orphan login so it can't sign in with no profile.
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      error: insertError?.message ?? "Could not create the customer.",
      success: null,
    };
  }

  // 3) Copy the source's custom pricing to the new customer.
  const { data: pricing } = await admin
    .from("customer_pricing")
    .select("product_id, custom_price")
    .eq("customer_id", sourceId);
  let copied = 0;
  if (pricing && pricing.length > 0) {
    const { error: priceErr } = await admin.from("customer_pricing").insert(
      pricing.map((p) => ({
        customer_id: newCust.id,
        product_id: p.product_id,
        custom_price: p.custom_price,
      })),
    );
    // The customer already exists; if pricing copy fails, keep it and tell the
    // admin to set pricing manually rather than rolling everything back.
    if (priceErr) {
      revalidatePath("/admin/customers");
      return {
        error: null,
        success: `Created ${businessName}, but copying pricing failed (${priceErr.message}). Set its pricing manually.`,
      };
    }
    copied = pricing.length;
  }

  revalidatePath("/admin/customers");
  revalidatePath("/admin");
  return {
    error: null,
    success: `Created ${businessName} with ${copied} custom price${copied === 1 ? "" : "s"} copied from the source.`,
  };
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

  // Net payment terms (days). Whole number, 0–365.
  const termsDays = Number(get("invoice_terms_days"));
  if (!Number.isInteger(termsDays) || termsDays < 0 || termsDays > 365) {
    return {
      error: "Payment terms must be a whole number of days between 0 and 365.",
      success: null,
    };
  }

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
      delivery_window: get("delivery_window") || null,
      sales_rep: get("sales_rep") || null,
      tier: get("tier") || null,
      notes: get("notes") || null,
      waive_delivery_minimum: formData.get("waive_delivery_minimum") === "on",
      allow_invoicing: formData.get("allow_invoicing") === "on",
      invoice_terms_days: termsDays,
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
