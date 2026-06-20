import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Email-link callback for Supabase Auth (password recovery). The reset email
// links here with a token_hash; we verify it (which sets the session cookie),
// then send the user on to set a new password. See the Reset Password email
// template: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/reset-password";
  // Only allow relative same-origin redirects.
  const next = nextParam.startsWith("/") ? nextParam : "/reset-password";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(next);
  }
  redirect("/forgot-password?expired=1");
}
