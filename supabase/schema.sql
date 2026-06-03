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
  created_at    timestamptz not null default now()
);

-- Products: the catalog. base_price applies unless a customer override exists.
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  unit        text not null default 'dozen',
  base_price  numeric(10,2) not null check (base_price >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

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
