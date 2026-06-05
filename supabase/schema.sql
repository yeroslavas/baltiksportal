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
  sales_rep     text,
  tier          text,
  notes         text,
  created_at    timestamptz not null default now()
);

-- Backfill internal customer columns on pre-existing databases (no-op on fresh).
alter table public.customers add column if not exists sales_rep text;
alter table public.customers add column if not exists tier      text;
alter table public.customers add column if not exists notes     text;

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
