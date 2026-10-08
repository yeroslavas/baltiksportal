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
  const { data: newCustomer, error: insertError } = await admin
    .from("customers")
    .insert({
      user_id: created.user.id,
      business_name: businessName,
      contact_name: contactName || null,
      email,
      phone: phone || null,
      address: address || null,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !newCustomer) {
    // Roll back the auth user so we don't leave an orphan login.
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      error: insertError?.message ?? "Could not create the customer.",
      success: null,
    };
  }

  // 3) Record the login's membership. An account can have several logins, and
  // membership — not customers.user_id — is what grants access (see
  // current_customer_ids() in schema.sql). Writing both keeps the legacy
  // fallback and the new path agreeing until user_id is dropped.
  await admin.from("customer_users").insert({
    customer_id: newCustomer.id,
    user_id: created.user.id,
  });

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
      "delivery_window, sales_rep, tier, waive_delivery_minimum, allow_invoicing, invoice_terms_days, slice_fee",
    )
    .eq("id", sourceId)
    .maybeSingle<{
      delivery_window: string | null;
      sales_rep: string | null;
      tier: string | null;
      waive_delivery_minimum: boolean;
      allow_invoicing: boolean;
      invoice_terms_days: number;
      slice_fee: number;
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
      slice_fee: src.slice_fee,
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

  // Membership row for the new login — see createCustomer above.
  await admin.from("customer_users").insert({
    customer_id: newCust.id,
    user_id: created.user.id,
  });

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
  const adminUser = await requireAdmin();

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

  // Negotiated per-dozen slice fee (0 = none).
  const sliceFee = Number(get("slice_fee").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(sliceFee) || sliceFee < 0) {
    return { error: "Slice fee must be a number of 0 or more.", success: null };
  }

  // Time-boxed credit-hold override date + reason (both optional). Empty = none.
  const creditOverride = get("credit_hold_override_until");
  if (creditOverride && !/^\d{4}-\d{2}-\d{2}$/.test(creditOverride)) {
    return { error: "Credit-hold override must be a valid date.", success: null };
  }
  const overrideReason = get("credit_hold_override_reason").slice(0, 300);

  const admin = createAdminClient();

  // Need user_id + current email (to detect a login change), and the current
  // override date/reason (to decide whether to re-stamp the audit trail).
  const { data: existing } = await admin
    .from("customers")
    .select(
      "user_id,email,credit_hold_override_until,credit_hold_override_reason",
    )
    .eq("id", id)
    .maybeSingle<{
      user_id: string;
      email: string | null;
      credit_hold_override_until: string | null;
      credit_hold_override_reason: string | null;
    }>();
  if (!existing) return { error: "Customer not found.", success: null };

  // Credit-hold override audit: stamp who/when only when it's newly granted or
  // changed; clear the whole trail when removed; otherwise leave the original
  // stamp intact so an unrelated save doesn't rewrite it.
  const overrideChanged =
    creditOverride !== (existing.credit_hold_override_until ?? "") ||
    overrideReason !== (existing.credit_hold_override_reason ?? "");
  const overrideFields = !creditOverride
    ? {
        credit_hold_override_until: null,
        credit_hold_override_reason: null,
        credit_hold_override_set_by: null,
        credit_hold_override_set_at: null,
      }
    : overrideChanged
      ? {
          credit_hold_override_until: creditOverride,
          credit_hold_override_reason: overrideReason || null,
          credit_hold_override_set_by: adminUser.email ?? null,
          credit_hold_override_set_at: new Date().toISOString(),
        }
      : {
          credit_hold_override_until: creditOverride,
          credit_hold_override_reason: overrideReason || null,
        };

  // NOTE: this deliberately no longer touches any auth user. customers.email is
  // the account's CONTACT address (auto-pay notices, the Stripe customer); it
  // stopped being a credential when accounts gained multiple logins, since
  // "the" login no longer exists. Sign-in emails are changed per login in the
  // Logins section on the customer page (updateLoginEmail).

  // Update the profile.
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
      slice_fee: Math.round(sliceFee * 100) / 100,
      ...overrideFields,
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

// ---------------------------------------------------------------------------
// Logins
//
// An account can have SEVERAL logins — commonly the person placing orders is
// not the person paying the invoices. Membership lives in customer_users; see
// current_customer_ids() in schema.sql for how it grants access.
//
// customers.user_id is still maintained as a legacy "primary login" pointer
// (the transitional fallback from Stage 1). Removal repoints it rather than
// orphaning it, so the column stays valid until it is dropped.
// ---------------------------------------------------------------------------

// Add another login to an existing account.
export async function addCustomerLogin(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const adminUser = await requireAdmin();

  const customerId = String(formData.get("customer_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!customerId) return { error: "Missing customer reference.", success: null };
  if (!email) return { error: "Enter an email address.", success: null };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", success: null };
  }

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id, business_name")
    .eq("id", customerId)
    .maybeSingle<{ id: string; business_name: string }>();
  if (!customer) return { error: "Customer not found.", success: null };

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
        : (authError?.message ?? "Could not create the login."),
      success: null,
    };
  }

  const { error: linkError } = await admin.from("customer_users").insert({
    customer_id: customer.id,
    user_id: created.user.id,
    created_by: adminUser.email ?? null,
  });
  if (linkError) {
    // Roll back so we never leave a login that can sign in with no account.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: linkError.message, success: null };
  }

  revalidatePath(`/admin/customers/${customer.id}`);
  revalidatePath("/admin/customers");
  return {
    error: null,
    success: `Added ${email} — copy the password and send it to them.`,
  };
}

// Remove a login from an account. The account must keep at least one.
export async function removeCustomerLogin(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const customerId = String(formData.get("customer_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  if (!customerId || !userId) {
    return { error: "Missing login reference.", success: null };
  }

  const admin = createAdminClient();
  const { data: links } = await admin
    .from("customer_users")
    .select("user_id")
    .eq("customer_id", customerId);
  const all = (links ?? []).map((l) => l.user_id as string);

  if (!all.includes(userId)) {
    return { error: "That login is not on this account.", success: null };
  }
  // Removing the last one would leave an account nobody can sign in to.
  if (all.length <= 1) {
    return {
      error: "An account must keep at least one login. Add another first.",
      success: null,
    };
  }

  const { error: unlinkError } = await admin
    .from("customer_users")
    .delete()
    .eq("customer_id", customerId)
    .eq("user_id", userId);
  if (unlinkError) return { error: unlinkError.message, success: null };

  // If this was the legacy primary pointer, move it to a surviving login —
  // customers.user_id is NOT NULL and still feeds the transitional fallback.
  const { data: customer } = await admin
    .from("customers")
    .select("user_id")
    .eq("id", customerId)
    .maybeSingle<{ user_id: string }>();
  if (customer?.user_id === userId) {
    const next = all.find((u) => u !== userId);
    if (next) {
      await admin.from("customers").update({ user_id: next }).eq("id", customerId);
    }
  }

  // DANGER: customers.user_id is `references auth.users on delete cascade`, so
  // deleting an auth user that the column still points at would cascade-delete
  // the CUSTOMER — orders and invoices with it. Re-read and refuse rather than
  // trusting the repoint above to have worked.
  const { data: after } = await admin
    .from("customers")
    .select("user_id")
    .eq("id", customerId)
    .maybeSingle<{ user_id: string }>();
  if (!after || after.user_id === userId) {
    // Put the membership back so the login isn't half-removed.
    await admin
      .from("customer_users")
      .insert({ customer_id: customerId, user_id: userId });
    return {
      error:
        "Could not move the primary login pointer off this login, so removing it was unsafe. Nothing was changed.",
      success: null,
    };
  }

  // The unique index on customer_users.user_id means a login belongs to exactly
  // one account, so once unlinked it has no purpose and would be a dangling
  // sign-in with nowhere to land.
  const { error: delError } = await admin.auth.admin.deleteUser(userId);
  if (delError) {
    return {
      error: `Login removed from the account, but deleting it failed: ${delError.message}`,
      success: null,
    };
  }

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { error: null, success: "Login removed." };
}

// Change the sign-in email of ONE login. Does not touch customers.email, which
// is the account's contact address rather than a credential.
export async function updateLoginEmail(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const customerId = String(formData.get("customer_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!customerId || !userId) {
    return { error: "Missing login reference.", success: null };
  }
  if (!email) return { error: "Enter an email address.", success: null };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (error) {
    const dup = /already|registered|exists|duplicate/i.test(error.message);
    return {
      error: dup ? "That email is already used by another login." : error.message,
      success: null,
    };
  }

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { error: null, success: `Sign-in email changed to ${email}.` };
}
