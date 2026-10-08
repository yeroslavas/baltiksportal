-- =============================================================================
-- Customer logins (membership) — Stage 1
--
-- Lets ONE account have SEVERAL logins (the person who places orders is often
-- not the person who pays). supabase/schema.sql remains the source of truth for
-- the full schema; this file is just the delta, so it can be pasted into the
-- Supabase SQL editor on its own. Safe to re-run.
--
-- ORDER MATTERS. Run this BEFORE deploying the app code. Every step here is
-- backwards-compatible with the currently-deployed app:
--   • the new table is additive and unread by the old code;
--   • current_customer_ids() accepts the legacy customers.user_id pointer as
--     well as membership, so the rewritten policies behave identically for the
--     existing one-login-per-account data.
-- The live site keeps working throughout.
-- =============================================================================

-- 1) Membership table -------------------------------------------------------

create table if not exists public.customer_users (
  customer_id uuid not null references public.customers (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  text,
  primary key (customer_id, user_id)
);

-- A login belongs to exactly ONE account. Dropping this unique index is what
-- would later enable "one login oversees several locations".
create unique index if not exists customer_users_user_id_key
  on public.customer_users (user_id);
create index if not exists idx_customer_users_customer
  on public.customer_users (customer_id);

-- 2) Backfill the existing one-login-per-account rows ------------------------

insert into public.customer_users (customer_id, user_id)
  select id, user_id from public.customers
  on conflict do nothing;

-- 3) RLS on the membership table --------------------------------------------

alter table public.customer_users enable row level security;

drop policy if exists "read own memberships" on public.customer_users;
create policy "read own memberships"
  on public.customer_users for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select (customer_id, user_id) on public.customer_users to authenticated;

-- 4) The single definition of "which accounts may this login see" ------------
--
-- SECURITY DEFINER so it reads customer_users without re-entering RLS (a policy
-- on customers that queried customers through RLS would recurse). search_path is
-- pinned, which is required for a definer function to be safe.
--
-- The second branch is TRANSITIONAL — it keeps the legacy customers.user_id
-- pointer working. Remove it (and the column) once the admin Logins UI lands.

create or replace function public.current_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select customer_id from public.customer_users where user_id = (select auth.uid())
  union
  select id from public.customers where user_id = (select auth.uid())
$$;

revoke all on function public.current_customer_ids() from public;
grant execute on function public.current_customer_ids() to authenticated;

-- 5) Route every customer-facing policy through that one function ------------
--
-- Previously each of these repeated the customers join, so the rule could drift
-- between tables. Now there is one definition.

drop policy if exists "customers read own row" on public.customers;
create policy "customers read own row"
  on public.customers for select
  to authenticated
  using (id in (select public.current_customer_ids()));

drop policy if exists "read own pricing" on public.customer_pricing;
create policy "read own pricing"
  on public.customer_pricing for select
  to authenticated
  using (customer_id in (select public.current_customer_ids()));

drop policy if exists "read own orders" on public.orders;
create policy "read own orders"
  on public.orders for select
  to authenticated
  using (customer_id in (select public.current_customer_ids()));

drop policy if exists "read own order items" on public.order_items;
create policy "read own order items"
  on public.order_items for select
  to authenticated
  using (
    order_id in (
      select o.id from public.orders o
      where o.customer_id in (select public.current_customer_ids())
    )
  );

drop policy if exists "read own invoices" on public.invoices;
create policy "read own invoices"
  on public.invoices for select
  to authenticated
  using (customer_id in (select public.current_customer_ids()));

-- 6) Sanity checks (read-only — run these after the above) -------------------
--
-- Every customer should have exactly one membership row at this point:
--   select
--     (select count(*) from public.customers)      as customers,
--     (select count(*) from public.customer_users) as memberships;
--
-- Any customer missing a membership (expect zero rows):
--   select c.id, c.business_name
--   from public.customers c
--   left join public.customer_users cu on cu.customer_id = c.id
--   where cu.customer_id is null;
