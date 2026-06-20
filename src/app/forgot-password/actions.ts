"use server";

import { createClient } from "@/lib/supabase/server";

export type ForgotState = { sent: boolean; error: string | null };

// Send a password-reset email. Always returns the same neutral result whether
// or not the address has an account — never reveal which emails are registered.
export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return { sent: false, error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  // The Reset Password email template controls the link (→ /auth/confirm with a
  // token_hash). Errors are swallowed so we don't leak whether the email exists.
  await supabase.auth.resetPasswordForEmail(email).catch(() => {});

  return { sent: true, error: null };
}
