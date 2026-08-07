-- =============================================================================
-- Baltiks Wholesale Portal — Phase 1 schema
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Safe to re-run: uses IF NOT EXISTS / idempotent policy drops.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- Customers: one row per wholesale business, linked to a Supabase auth user.
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  business_name text not null,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  delivery_window text,
  sales_rep     text,
  tier          text,
  notes         text,
  waive_delivery_minimum boolean not null default false,
  allow_invoicing boolean not null default false,
  -- Auto-pay: customer authorizes ACH once (saved on a persistent Stripe
  -- Customer), then invoices charge automatically on their due date. Only
  -- autopay_enabled + autopay_bank_last4 are customer-readable (see grants).
  stripe_customer_id text,
  autopay_enabled boolean not null default false,
  autopay_payment_method_id text,
  autopay_bank_last4 text,
  autopay_fail_count integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Backfill internal customer columns on pre-existing databases (no-op on fresh).
alter table public.customers add column if not exists sales_rep text;
alter table public.customers add column if not exists tier      text;
alter table public.customers add column if not exists notes     text;
-- The customer's assigned delivery/pickup time window (snapshotted onto orders).
alter table public.customers add column if not exists delivery_window text;
-- When true, this customer is exempt from the delivery minimum (free delivery).
alter table public.customers add column if not exists waive_delivery_minimum boolean not null default false;
-- When true, this customer may pay by invoice (vs upfront) — for the future payment flow.
alter table public.customers add column if not exists allow_invoicing boolean not null default false;
-- Auto-pay columns (no-op on fresh installs).
alter table public.customers add column if not exists stripe_customer_id text;
alter table public.customers add column if not exists autopay_enabled boolean not null default false;
alter table public.customers add column if not exists autopay_payment_method_id text;
alter table public.customers add column if not exists autopay_bank_last4 text;
alter table public.customers add column if not exists autopay_fail_count integer not null default 0;
-- Per-dozen slice fee. Standard rate is $1.20/doz for every account; negotiable
-- per customer on the edit page. Customer-readable (see grants) so the cart can
-- show it. See products.allow_slicing.
alter table public.customers add column if not exists slice_fee numeric(10,2) not null default 1.20 check (slice_fee >= 0);
-- Move the standard rate to 1.20 for existing installs (add-column above won't
-- change a pre-existing column's default).
alter table public.customers alter column slice_fee set default 1.20;

-- Products: the catalog. base_price applies unless a customer override exists.
-- name/description/unit/base_price are customer-facing; sku + the report_*/
-- bake_time/product_type fields are internal (reporting, managed via CSV import).
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  unit          text not null default 'dozen',
  base_price    numeric(10,2) not null check (base_price >= 0),
  is_active     boolean not null default true,
  -- When true, this product can be ordered in 0.5 increments (half-dozen).
  -- Off by default → whole units only (discrete packs).
  allow_half_dozen boolean not null default false,
  -- When true, the item can be ordered sliced (adds the customer's slice_fee).
  allow_slicing boolean not null default false,
  image_url     text,
  sku           text,
  bake_time     text,
  product_type  text,
  report_group  text,
  report_unit   text,
  report_count  integer,
  sort_order    numeric,
  created_at    timestamptz not null default now()
);

-- Backfill the internal columns on databases created before they existed.
-- (No-ops on a fresh install where the create table above already added them.)
alter table public.products add column if not exists sku          text;
alter table public.products add column if not exists bake_time    text;
alter table public.products add column if not exists product_type text;
alter table public.products add column if not exists report_group text;
alter table public.products add column if not exists report_unit  text;
alter table public.products add column if not exists report_count integer;
alter table public.products add column if not exists sort_order   numeric;
alter table public.products add column if not exists image_url    text;
alter table public.products add column if not exists allow_half_dozen boolean not null default false;
-- Sliceable flag (no-op on fresh installs). Customer-readable (see grants).
alter table public.products add column if not exists allow_slicing boolean not null default false;
-- sort_order is numeric so new products can be inserted between two existing
-- ones (e.g. 5.5 between 5 and 6) without renumbering the rest.
alter table public.products alter column sort_order type numeric;

-- SKU is the unique product key (nullable: UI-created products may lack one;
-- Postgres treats NULLs as distinct, so multiple null-SKU rows are allowed).
create unique index if not exists products_sku_key on public.products (sku);

-- Customer pricing: per-customer override of a product's price.
create table if not exists public.customer_pricing (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers (id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete cascade,
  custom_price numeric(10,2) not null check (custom_price >= 0),
  created_at   timestamptz not null default now(),
  unique (customer_id, product_id)
);

create index if not exists idx_customer_pricing_customer on public.customer_pricing (customer_id);
create index if not exists idx_customer_pricing_product  on public.customer_pricing (product_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- Customers use the anon/public key, so RLS protects their data. The admin app
-- uses the service_role key, which BYPASSES RLS entirely — so there are no
-- admin policies here; admin reads/writes happen server-side with that key.
-- ----------------------------------------------------------------------------

alter table public.customers        enable row level security;
alter table public.products         enable row level security;
alter table public.customer_pricing enable row level security;

-- A signed-in customer can read only their own customer row.
drop policy if exists "customers read own row" on public.customers;
create policy "customers read own row"
  on public.customers for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Any signed-in user can read the active catalog.
drop policy if exists "read active products" on public.products;
create policy "read active products"
  on public.products for select
  to authenticated
  using (is_active = true);

-- A customer can read only the pricing rows that belong to them.
drop policy if exists "read own pricing" on public.customer_pricing;
create policy "read own pricing"
  on public.customer_pricing for select
  to authenticated
  using (
    customer_id in (
      select id from public.customers where user_id = (select auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- Column-level hardening
--
-- RLS above restricts which ROWS a signed-in customer can read. These grants
-- restrict which COLUMNS — so internal fields can't be read via the REST API
-- even on a row the customer owns. We revoke table-wide SELECT from the API
-- roles and re-grant only the customer-facing columns. The service_role (admin
-- app + importer) bypasses this and keeps full access.
-- ----------------------------------------------------------------------------

-- customers: hide sales_rep, tier, notes (internal admin fields).
revoke select on public.customers from anon, authenticated;
grant select (id, user_id, business_name, contact_name, email, phone, address, autopay_enabled, autopay_bank_last4, slice_fee, created_at)
  on public.customers to anon, authenticated;

-- products: hide sku, bake_time, product_type, report_* (internal/reporting).
revoke select on public.products from anon, authenticated;
grant select (id, name, description, unit, base_price, is_active, sort_order, image_url, allow_half_dozen, allow_slicing, created_at)
  on public.products to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Phase 2: Orders
--
-- order_items snapshot product_name + unit_price at order time, so history is
-- immutable even if a product is renamed, repriced, or deleted. Orders are
-- created and their status updated SERVER-SIDE with the service_role key
-- (prices recomputed there, never trusted from the client), so there are no
-- insert/update RLS policies — only read-own-orders.
-- ----------------------------------------------------------------------------

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  order_number  bigint generated always as identity (start with 1000),
  customer_id   uuid not null references public.customers (id) on delete cascade,
  order_date    timestamptz not null default now(),
  status        text not null default 'pending'
                  check (status in ('pending', 'processing', 'fulfilled')),
  total_amount  numeric(10,2) not null default 0 check (total_amount >= 0),
  delivery_fee  numeric(10,2) not null default 0 check (delivery_fee >= 0),
  fulfillment_type text not null default 'delivery'
                  check (fulfillment_type in ('delivery', 'pickup')),
  delivery_date date,
  delivery_time text,
  created_at    timestamptz not null default now()
);

create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  product_id   uuid references public.products (id) on delete set null,
  product_name text not null,
  -- numeric (not integer) so half-dozen products can be ordered in 0.5 steps.
  quantity     numeric not null check (quantity > 0),
  unit_price   numeric(10,2) not null check (unit_price >= 0),
  line_total   numeric(10,2) not null check (line_total >= 0),
  created_at   timestamptz not null default now()
);

-- Widen quantity to numeric on databases created when it was integer-only.
alter table public.order_items alter column quantity type numeric;

create index if not exists idx_orders_customer  on public.orders (customer_id);
create index if not exists idx_orders_date       on public.orders (order_date desc);
create index if not exists idx_order_items_order on public.order_items (order_id);

-- Phase 2.1: fulfillment fields (idempotent for existing databases).
alter table public.orders add column if not exists fulfillment_type text not null
  default 'delivery' check (fulfillment_type in ('delivery', 'pickup'));
alter table public.orders add column if not exists delivery_date date;
alter table public.orders add column if not exists delivery_time text;

-- Slicing: sliceable items (products.allow_slicing) can be ordered sliced, adding
-- the customer's negotiated per-dozen slice_fee. order_items.sliced marks the
-- lines; orders.slice_fee is the order-level charge; standing_order_items.sliced
-- carries the choice onto every order the generator makes. (No-ops on fresh.)
alter table public.orders add column if not exists slice_fee numeric(10,2) not null default 0 check (slice_fee >= 0);
alter table public.order_items add column if not exists sliced boolean not null default false;
alter table public.standing_order_items add column if not exists sliced boolean not null default false;
alter table public.orders add column if not exists delivery_fee numeric(10,2)
  not null default 0 check (delivery_fee >= 0);

alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

grant select on public.orders      to authenticated;
grant select on public.order_items to authenticated;

-- A customer can read only their own orders.
drop policy if exists "read own orders" on public.orders;
create policy "read own orders"
  on public.orders for select
  to authenticated
  using (
    customer_id in (
      select id from public.customers where user_id = (select auth.uid())
    )
  );

-- A customer can read only the items of their own orders.
drop policy if exists "read own order items" on public.order_items;
create policy "read own order items"
  on public.order_items for select
  to authenticated
  using (
    order_id in (
      select o.id
      from public.orders o
      join public.customers c on c.id = o.customer_id
      where c.user_id = (select auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- Pending orders (pay-first checkout)
--
-- A customer WITHOUT allow_invoicing must pay at checkout; the real order isn't
-- created until payment is authorized. This row holds the cart between starting
-- Stripe Checkout and the webhook that materializes the order. Service-role only.
-- ----------------------------------------------------------------------------

create table if not exists public.pending_orders (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers (id) on delete cascade,
  lines            jsonb not null, -- [{ productId, quantity }]
  fulfillment_type text not null default 'delivery'
                     check (fulfillment_type in ('delivery', 'pickup')),
  delivery_date    date not null,
  -- Snapshot of the priced order (PricedOrder: items, fee, total) at checkout,
  -- so the webhook materializes the order at the exact price charged even if
  -- catalog prices change before ACH settles. Null on rows predating this.
  priced           jsonb,
  created_at       timestamptz not null default now()
);
alter table public.pending_orders add column if not exists priced jsonb;

alter table public.pending_orders enable row level security;
-- No policies: created/consumed server-side with the service_role key only.

-- Holds the set of invoices a customer chose to pay together in one Stripe
-- Checkout, so the webhook knows which invoices to mark paid. Service-role only.
create table if not exists public.payment_batches (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  invoice_ids uuid[] not null,
  created_at  timestamptz not null default now()
);

alter table public.payment_batches enable row level security;
-- No policies: created server-side with the service_role key only.

-- ----------------------------------------------------------------------------
-- App settings (admin Utilities page)
--
-- A single pinned row (id = 1) holding admin-editable operational settings:
-- the delivery fee, the delivery minimum, and the list of delivery/pickup
-- windows. Read server-side with the service_role key (src/lib/settings.ts);
-- the admin Utilities page updates it. RLS is on with NO policies, so the
-- customer API keys can't read or write it — only the service_role can.
-- ----------------------------------------------------------------------------

create table if not exists public.app_settings (
  id               smallint primary key default 1 check (id = 1),
  delivery_fee     numeric(10,2) not null default 15.99 check (delivery_fee >= 0),
  delivery_minimum numeric(10,2) not null default 99 check (delivery_minimum >= 0),
  delivery_windows text[] not null default array['7:00–8:30 AM', '9:30–11:30 AM'],
  updated_at       timestamptz not null default now()
);

-- Seed the single row (no-op once it exists).
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- ----------------------------------------------------------------------------
-- Standing orders (recurring order templates)
--
-- A standing_orders row is a TEMPLATE, not an order: it describes a recurring
-- schedule (which weekdays, weekly or every-other-week) and its line items.
-- A daily generator materialises due templates into real public.orders rows a
-- few days ahead (see src/lib/standing-orders + the cron route). Prices are NOT
-- stored on the template — they're resolved at generation time, so pricing
-- changes flow through automatically.
--
-- Read/written server-side with the service_role key (ownership checked in
-- server actions), so RLS is on with no policies — like app_settings.
-- ----------------------------------------------------------------------------

create table if not exists public.standing_orders (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers (id) on delete cascade,
  fulfillment_type text not null default 'delivery'
                     check (fulfillment_type in ('delivery', 'pickup')),
  -- ISO weekdays the order recurs on: 1 = Monday … 7 = Sunday.
  days_of_week     int[] not null default '{}',
  -- 1 = weekly, 2 = every other week (parity measured from anchor_date).
  interval_weeks   smallint not null default 1 check (interval_weeks in (1, 2)),
  -- First eligible date + biweekly parity anchor; optional last date.
  anchor_date      date not null,
  end_date         date,
  -- One-off skips (holidays/closures) and a hard active/pause switch.
  skip_dates       date[] not null default '{}',
  is_active        boolean not null default true,
  -- How many days before the delivery date to create the order (review window).
  lead_days        smallint not null default 3 check (lead_days between 0 and 14),
  note             text,
  created_at       timestamptz not null default now()
);

create table if not exists public.standing_order_items (
  id                uuid primary key default gen_random_uuid(),
  standing_order_id uuid not null
                      references public.standing_orders (id) on delete cascade,
  product_id        uuid not null references public.products (id) on delete cascade,
  -- numeric so half-dozen products can carry 0.5-step standing quantities.
  quantity          numeric not null check (quantity > 0),
  created_at        timestamptz not null default now()
);

create index if not exists idx_standing_orders_customer
  on public.standing_orders (customer_id);
create index if not exists idx_standing_order_items_so
  on public.standing_order_items (standing_order_id);
-- Widen quantity to numeric on databases created when it was integer-only.
alter table public.standing_order_items alter column quantity type numeric;

-- Link a generated order back to its standing order. The PARTIAL UNIQUE index
-- is the idempotency guarantee: at most one order per (standing order, delivery
-- date), so the generator can run repeatedly / overlap without ever doubling up.
alter table public.orders add column if not exists standing_order_id uuid
  references public.standing_orders (id) on delete set null;
create unique index if not exists orders_standing_order_date_key
  on public.orders (standing_order_id, delivery_date)
  where standing_order_id is not null;

alter table public.standing_orders      enable row level security;
alter table public.standing_order_items enable row level security;

-- ----------------------------------------------------------------------------
-- Phase 3: Invoicing — business identity on app_settings
--
-- Name + address printed at the top of every invoice PDF. Admin-editable on the
-- Utilities page, alongside the delivery settings. Added via alter (idempotent)
-- so this section is safe to re-run on databases created in earlier phases.
-- ----------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists business_name text not null default 'Baltik''s Bagel';
alter table public.app_settings
  add column if not exists business_address text not null default '';

-- Per-customer invoice payment terms: how many days after issue an invoice is
-- due (net terms). Admin-editable on the customer edit page; the invoice
-- generator reads it to set each invoice's due date. Internal — not granted to
-- the customer API roles (customers still see the resulting due date per invoice).
alter table public.customers
  add column if not exists invoice_terms_days integer not null default 7
  check (invoice_terms_days between 0 and 365);
-- Default net terms is 7 days. The add-column above is a no-op once the column
-- exists, so set the default explicitly for already-migrated databases. Applies
-- to NEW customers only — existing rows keep their current value.
alter table public.customers alter column invoice_terms_days set default 7;

-- ----------------------------------------------------------------------------
-- Order cutoff (next-day ordering window)
--
-- A global cutoff hour (business timezone, America/New_York) after which the
-- next day closes for CUSTOMER ordering: before the cutoff the earliest
-- fulfillment date is tomorrow; at/after it, tomorrow closes and the earliest
-- is the day after. Enforced server-side on customer checkout only — admins and
-- the standing-order generator are exempt. Hour granularity (0–23) matches the
-- "8 PM" style cutoff. Read with the service_role key via src/lib/settings.ts.
-- ----------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists order_cutoff_enabled boolean not null default true;
alter table public.app_settings
  add column if not exists order_cutoff_hour smallint not null default 20
  check (order_cutoff_hour between 0 and 23);

-- Weekdays the business accepts orders for (ISO: 1=Mon … 7=Sun). Customers can't
-- pick a fulfillment date on a day not in this set (e.g. closed Sundays → drop 7).
alter table public.app_settings
  add column if not exists available_days int[] not null default '{1,2,3,4,5,6,7}';

-- Last Google Sheets production-export run: { at, ok, rows, error, durationMs }.
-- Powers the admin freshness indicator + in-sheet stamp. See src/lib/orders-export.ts.
alter table public.app_settings
  add column if not exists sheets_sync_state jsonb;

-- ----------------------------------------------------------------------------
-- Order cancellation (soft)
--
-- Admins can cancel an order instead of deleting it: the order is marked
-- 'canceled' and its invoice 'canceled' (voided — kept on record but excluded
-- from outstanding balances and the overdue sweep). The record is preserved for
-- audit, and a canceled standing-order instance stays in place so the nightly
-- generator won't recreate it. Reinstating restores the order to 'pending' and
-- the invoice to 'unpaid'.
--
-- These widen the existing status CHECKs (drop + re-add is idempotent on re-run).
-- ----------------------------------------------------------------------------

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'processing', 'fulfilled', 'canceled'));

alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('unpaid', 'paid', 'overdue', 'canceled'));

-- ----------------------------------------------------------------------------
-- Invoice summary (admin dashboard cards)
--
-- Computes the outstanding balance + unpaid/overdue counts across ALL invoices
-- in the database. The admin invoices list is paginated, so these totals can't
-- be derived from the visible page; a server-side aggregate stays accurate at
-- any volume (and never hits the REST row cap). Called with the service_role
-- key — execute is revoked from the customer API roles.
-- ----------------------------------------------------------------------------

create or replace function public.invoice_summary()
returns table (
  outstanding_total numeric,
  unpaid_count bigint,
  overdue_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(total_amount - credit_amount) filter (where status in ('unpaid', 'overdue')), 0)::numeric,
    count(*) filter (where status = 'unpaid'),
    count(*) filter (where status = 'overdue')
  from public.invoices;
$$;

revoke all on function public.invoice_summary() from public, anon, authenticated;
grant execute on function public.invoice_summary() to service_role;

-- ----------------------------------------------------------------------------
-- Phase 3: Invoices
--
-- One invoice per order (order_id is UNIQUE — that's the auto-generation
-- idempotency guarantee). Line items are NOT duplicated here: the PDF and detail
-- views read them from the linked order's order_items, which are already an
-- immutable snapshot. total_amount is copied from the order at issue time.
--
-- invoice_number is human-readable (INV-0001, INV-0002, …). It's filled by a
-- column DEFAULT off a dedicated sequence, so it's gap-tolerant, sequential, and
-- assigned regardless of how the row is inserted — no app-side max() race.
--
-- Customers read their own invoices via the anon key + RLS (like orders). All
-- writes (auto-generation, mark-paid, overdue sweep) happen server-side with the
-- service_role key, which bypasses RLS — so there's only a read-own policy.
-- ----------------------------------------------------------------------------

create sequence if not exists public.invoice_number_seq start with 1;

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text not null unique
                   default ('INV-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0')),
  customer_id    uuid not null references public.customers (id) on delete cascade,
  order_id       uuid not null unique references public.orders (id) on delete cascade,
  issue_date     date not null default current_date,
  due_date       date not null default (current_date + 7),
  status         text not null default 'unpaid'
                   check (status in ('unpaid', 'paid', 'overdue')),
  total_amount   numeric(10,2) not null default 0 check (total_amount >= 0),
  -- Admin credit/adjustment (shorted/damaged order, pricing fix). Amount owed =
  -- total_amount − credit_amount (clamped ≥ 0); a full credit settles the invoice.
  credit_amount  numeric(10,2) not null default 0 check (credit_amount >= 0),
  credit_reason  text,
  -- Set when an admin marks the invoice paid; cleared if moved back to unpaid.
  paid_at        timestamptz,
  -- Internal admin note for off-platform payments (e.g. a check #). Never shown
  -- to the customer or on the PDF.
  payment_note   text,
  -- Stripe PaymentIntent id when paid online.
  stripe_payment_id text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_invoices_customer on public.invoices (customer_id);
create index if not exists idx_invoices_status   on public.invoices (status);

-- Backfill payment_note on pre-existing databases (no-op on fresh installs).
alter table public.invoices add column if not exists payment_note text;
-- Stripe PaymentIntent id, set when an invoice is paid online (paid_at already
-- exists above). Reference back to the Stripe transaction.
alter table public.invoices add column if not exists stripe_payment_id text;
-- Admin credit/adjustment columns (no-op on fresh installs).
alter table public.invoices add column if not exists credit_amount numeric(10,2) not null default 0 check (credit_amount >= 0);
alter table public.invoices add column if not exists credit_reason text;
-- Keep the invoice-level due-date fallback in step with the 7-day net terms (the
-- app sets due_date explicitly per customer, so this only applies to a direct
-- insert with no due_date). No-op on fresh installs — table default is already 7.
alter table public.invoices alter column due_date set default (current_date + 7);

alter table public.invoices enable row level security;

grant select on public.invoices to authenticated;

-- A customer can read only their own invoices.
drop policy if exists "read own invoices" on public.invoices;
create policy "read own invoices"
  on public.invoices for select
  to authenticated
  using (
    customer_id in (
      select id from public.customers where user_id = (select auth.uid())
    )
  );
