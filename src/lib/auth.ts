import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Returns the signed-in user, or null.
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Returns the signed-in user, or redirects to /login.
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

// Admins are configured via the ADMIN_EMAILS env var (comma-separated).
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

// Returns the signed-in admin user, or redirects.
// Non-admin signed-in users are sent to /catalog; signed-out users to /login.
export async function requireAdmin(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!isAdmin(user.email)) redirect("/catalog");
  return user;
}
