// Bootstrap the first admin login.
//
// Usage (Node 20.6+ loads the env file natively):
//   node --env-file=.env.local scripts/create-admin.mjs <email> <password>
//
// Creates a Supabase auth user only (the admin is not a customer record).
// The email must also be listed in ADMIN_EMAILS to reach /admin.

import { createClient } from "@supabase/supabase-js";

const [, , email, password] = process.argv;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !password) {
  console.error(
    "Usage: node --env-file=.env.local scripts/create-admin.mjs <email> <password>",
  );
  process.exit(1);
}

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/create-admin.mjs ...",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error) {
  console.error("Failed to create admin user:", error.message);
  process.exit(1);
}

console.log(`✓ Created auth user: ${data.user.email} (${data.user.id})`);
console.log(
  `→ Ensure ADMIN_EMAILS in .env.local includes "${email}", then sign in at /login.`,
);
