-- Run in Supabase SQL editor (Dashboard → SQL Editor → New Query → paste → Run).
-- Ensures anon role can insert new orders and read them back.

alter table public.orders enable row level security;

-- INSERT: allow anon to create orders
drop policy if exists "anon_insert_orders" on public.orders;
create policy "anon_insert_orders"
  on public.orders
  for insert
  to anon
  with check (true);

-- SELECT: allow anon to read orders (needed for .insert().select() and the admin page)
drop policy if exists "anon_select_orders" on public.orders;
create policy "anon_select_orders"
  on public.orders
  for select
  to anon
  using (true);

-- UPDATE: allow anon to update orders (needed for admin marking fraud)
drop policy if exists "anon_update_orders" on public.orders;
create policy "anon_update_orders"
  on public.orders
  for update
  to anon
  using (true)
  with check (true);

-- Grants
grant usage on schema public to anon;
grant select, insert, update on table public.orders to anon;
