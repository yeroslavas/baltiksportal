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
grant select (id, user_id, business_name, contact_name, email, phone, address, created_at)
  on public.customers to anon, authenticated;

-- products: hide sku, bake_time, product_type, report_* (internal/reporting).
revoke select on public.products from anon, authenticated;
grant select (id, name, description, unit, base_price, is_active, sort_order, image_url, created_at)
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
  quantity     integer not null check (quantity > 0),
  unit_price   numeric(10,2) not null check (unit_price >= 0),
  line_total   numeric(10,2) not null check (line_total >= 0),
  created_at   timestamptz not null default now()
);

create index if not exists idx_orders_customer  on public.orders (customer_id);
create index if not exists idx_orders_date       on public.orders (order_date desc);
create index if not exists idx_order_items_order on public.order_items (order_id);

-- Phase 2.1: fulfillment fields (idempotent for existing databases).
alter table public.orders add column if not exists fulfillment_type text not null
  default 'delivery' check (fulfillment_type in ('delivery', 'pickup'));
alter table public.orders add column if not exists delivery_date date;
alter table public.orders add column if not exists delivery_time text;

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
