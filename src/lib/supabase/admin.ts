import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. BYPASSES Row Level Security — never import this into
// client components or expose the key. Use only inside server actions / route
// handlers that have already verified the caller is an admin.
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
