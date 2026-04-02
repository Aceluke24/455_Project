-- Run in Supabase SQL editor after creating the orders table.
alter table public.orders enable row level security;

drop policy if exists "anon_insert_orders" on public.orders;
create policy "anon_insert_orders"
on public.orders
for insert
to anon
with check (true);

-- Optional: allow anon to read only the order_id they just created
-- for immediate UI confirmation if needed.
grant usage on schema public to anon;
grant insert on table public.orders to anon;
grant select on table public.orders to anon;
