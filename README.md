# Baltiks Wholesale Portal — Phase 1

A wholesale bagel ordering portal. Phase 1 covers project setup, authentication,
and the customer/pricing foundation.

- **Stack:** Next.js 16 (App Router) · TypeScript · Supabase (DB + Auth) · Tailwind CSS v4
- **Auth model:** email/password via Supabase Auth. **No self-signup** — the admin
  creates customer accounts. `/admin` is gated by an email allowlist.

## Features

- **Login** (`/login`) — branded email/password sign-in.
- **Catalog** (`/catalog`) — each customer sees the active products at **their** price
  (`customer_pricing` override, falling back to the product's `base_price`).
- **Admin** (`/admin`) — protected area to create customers, manage products, and
  assign per-customer pricing.

## One-time setup

> The project lives on local disk (`C:\Users\Baltiks Bagel\baltiks-portal`) — **not**
> Google Drive, which can't reliably host `node_modules` / a dev server.

### 1. Environment variables

Open `.env.local` and fill in the four values (find the Supabase ones under
**Project Settings → API**):

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → `anon` / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → `service_role` key (**secret**) |
| `ADMIN_EMAILS` | comma-separated admin emails (already set to `yero@baltiksbagel.com`) |

The `service_role` key is server-only — it powers admin writes and is never sent to the browser.

### 2. Create the database

In the Supabase dashboard, open **SQL Editor → New query**, paste the contents of
[`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the
`customers`, `products`, and `customer_pricing` tables plus Row Level Security policies.

### 3. Create your admin login

The admin needs a Supabase auth account. Either:

```powershell
node --env-file=.env.local scripts/create-admin.mjs yero@baltiksbagel.com "your-strong-password"
```

…or add the user manually in **Authentication → Users → Add user** (enable
"Auto Confirm"). Make sure the email matches `ADMIN_EMAILS`.

### 4. Run it

```powershell
npm run dev
```

Open http://localhost:3000 and sign in.

## Day-to-day usage

1. Sign in as the admin → **Products**: add a few products (name, unit, base price).
2. **Customers**: create a customer (business name, login email, temporary password).
3. **Pricing**: pick that customer and set custom prices for any products (blank = base price).
4. Sign in as the customer → **Catalog**: they see their prices; rows with an override
   show a "Your price" badge. Customers cannot reach `/admin`.

**Forgot a password?** There's no self-service email reset yet (that needs SMTP).
For now, on **Customers** click **Reset password** next to the customer, **Generate**
a new temporary password (or type one), **Set password**, then pass it to them.

## Project layout

```
supabase/schema.sql            # DB tables + RLS — run in Supabase
scripts/create-admin.mjs       # bootstrap the first admin auth user
src/proxy.ts                   # session refresh + route protection (Next 16 "proxy")
src/lib/
  supabase/{client,server,admin,middleware}.ts
  auth.ts                      # getUser / requireUser / isAdmin / requireAdmin
  types.ts                     # row types  ·  format.ts: currency formatting
src/app/
  login/                       # branded login + auth server actions
  catalog/                     # customer catalog with resolved pricing
  admin/{customers,products,pricing}/   # admin CRUD via service-role server actions
```

## Security notes

- Customers use the anon key; **RLS** restricts them to their own customer row,
  active products, and their own pricing.
- All admin reads/writes use the `service_role` key inside server actions, each guarded
  by `requireAdmin()`. The key never reaches the client.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (type-check + lint) |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
