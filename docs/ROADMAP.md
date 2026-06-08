# Baltik's Wholesale Portal — Roadmap & Context

A living overview of where the project is, the key decisions/conventions, and
what's next. Lives in the repo so it travels across machines and sessions.

## What this is

A wholesale bagel ordering portal: customers sign in, browse a catalog at
**their** prices, place orders, and track them; the admin manages customers,
products, pricing, orders, and photos. No self-signup — the admin provisions
accounts.

- **Stack:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres + Auth +
  Storage) · Tailwind v4 · deployed on Vercel.
- **Live:** https://baltiksportal.vercel.app
- **Repo:** https://github.com/yeroslavas/baltiksportal (private). `main`
  auto-deploys to Vercel on push.

## Running locally

```
git clone https://github.com/yeroslavas/baltiksportal.git
cd baltiksportal
npm install
# create .env.local (NOT in git) — see below
npm run dev
```

`.env.local` (gitignored) needs four values — same ones set in Vercel:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`. Also gitignored and local-only:
`data/*.csv` (real customer/pricing data) and `data/credentials.csv`.

`supabase/schema.sql` is the full DB schema — safe to re-run in the Supabase SQL
editor. DDL/grants can't run through the API, so schema changes are applied
there by hand.

## Architecture & conventions

- **Auth:** Supabase email/password. Admin = email in `ADMIN_EMAILS`. Customers
  use the anon key + RLS; the admin app + scripts use the service-role key
  (bypasses RLS) inside server actions guarded by `requireAdmin()`.
- **Pricing:** each customer sees `customer_pricing.custom_price` if set, else
  the product's `base_price`. Resolved server-side.
- **CSV bulk import** (`scripts/import-data.mjs`): products keyed by **`sku`**
  (unique, rename-proof), customers by **email**, pricing matches customer by
  `email`→`business_name` and product by `sku`/`product_sku`→`product_name`.
  In `pricing.csv`, a **blank** price = use base price (no override); an explicit
  **`0`** = a real $0/free price. Re-runnable (upserts).
- **Product photos** (`scripts/import-images.mjs` or in-app upload on the
  product forms): one image per product in the public `product-images` Storage
  bucket; `image_url` on `products`. In-app uploads capped at 2MB.
- **Internal vs customer-facing columns:** `products.sku/bake_time/product_type/
  report_*` and `customers.sales_rep/tier/notes` are internal — column-level
  grants hide them from the API roles (customers can't read them even on their
  own row). The admin (service-role) sees everything.
- **Multi-location customers:** chains run by one person use `+` email aliases
  (e.g. `name+lafayette@x.com`) so each location is its own account with its own
  pricing, all delivering to one inbox. A true multi-location model is deferred.

## Orders (Phase 2 — built)

- **Cart:** client-side, sessionStorage (`src/lib/cart.tsx`), no cross-session
  persistence.
- **Checkout:** `placeOrder` (`src/app/checkout/actions.ts`) recomputes every
  price server-side from the catalog + the customer's overrides — the client's
  cart prices are never trusted. `order_items` snapshot `product_name` +
  `unit_price` at order time, so history is immutable.
- **Status:** stored, default `pending`, values `pending → processing →
  fulfilled`; the **admin** updates it manually. (No auto-transitions, edit
  window, or cancel state — those were an earlier idea, not built.)
- **RLS:** customers read only their own orders/items; creation + status changes
  are service-role/admin-gated.

## Status

- ✅ **Phase 1** — auth, customers/products/pricing, catalog, admin CRUD, CSV
  import, branding, mobile, deploy, security hardening.
- ✅ **Phase 1.5** — product photos (catalog display, in-app upload, bulk import).
- ✅ **Phase 2** — cart, checkout/order placement, order history, admin orders.

## What's next

Phase 2 scope still to build (all designed, none built):

- **Invoices** — generate invoices from orders, mark paid, track outstanding.
  (`/admin/invoices` is a placeholder.) Likely needs transactional email (SMTP,
  e.g. Resend) — which would also enable self-service password reset + order
  confirmation emails.
- **Reporting** — sales by customer/product, order volume, revenue.
  (`/admin/reporting` is a placeholder; the `report_*` product fields feed this.)
- **Team & roles** — self-service admin "Team" page with per-user roles
  (admin / viewer / wholesale-lead). The lead's powers (resend invoices, see
  reporting) depend on Invoices + Reporting, so build it alongside those.
- **True multi-location** — one login that sees/orders for multiple locations.

Optional hardening (dashboard toggles, not blocking): enable Supabase
leaked-password protection; MFA on the admin account + Vercel + GitHub; delete
`data/credentials.csv` after distributing logins.

## Key paths

```
supabase/schema.sql              # full DB schema (run in Supabase SQL editor)
scripts/import-data.mjs          # bulk CSV import (products/customers/pricing)
scripts/import-images.mjs        # bulk product-photo upload by SKU
scripts/create-admin.mjs         # bootstrap an admin auth user
src/lib/                         # auth, supabase clients, cart, types, format
src/app/catalog                  # customer catalog + add-to-cart
src/app/cart, /checkout, /orders # customer cart → checkout → history
src/app/admin/*                  # admin: customers, products, pricing, orders, …
src/components/                  # shared CustomerHeader, StatusBadge
```
