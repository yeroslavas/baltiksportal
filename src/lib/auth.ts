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

// Super-admins are the subset of admins who can also access the Utilities panel.
// Configured via SUPER_ADMIN_EMAILS (comma-separated). If that var is UNSET,
// every admin counts as a super-admin — so deploying this code can't lock anyone
// out of Utilities before the var is configured. Once set, only the listed
// emails (which must also be in ADMIN_EMAILS) keep Utilities access.
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email || !isAdmin(email)) return false;
  const allowlist = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return true; // unset → all admins are super (bootstrap)
  return allowlist.includes(email.toLowerCase());
}

// Returns the signed-in super-admin user, or redirects. A signed-in admin who
// isn't a super-admin is sent to the admin dashboard; non-admins to /catalog.
export async function requireSuperAdmin(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!isAdmin(user.email)) redirect("/catalog");
  if (!isSuperAdmin(user.email)) redirect("/admin");
  return user;
}
