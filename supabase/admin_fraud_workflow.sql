-- Run this in Supabase SQL editor for the admin fraud review workflow.

create table if not exists public.order_fraud_predictions (
  order_id bigint primary key references public.orders(order_id) on delete cascade,
  fraud_probability double precision not null,
  predicted_is_fraud integer not null check (predicted_is_fraud in (0, 1)),
  model_name text not null default 'rule_based_v1',
  model_version text,
  prediction_timestamp timestamptz not null default now()
);

create table if not exists public.fraud_feedback (
  order_id bigint primary key references public.orders(order_id) on delete cascade,
  predicted_is_fraud integer check (predicted_is_fraud in (0, 1)),
  fraud_probability double precision,
  actual_is_fraud integer check (actual_is_fraud in (0, 1)),
  reviewed_by text,
  reviewed_at timestamptz,
  is_prediction_correct integer check (is_prediction_correct in (0, 1))
);

alter table public.order_fraud_predictions enable row level security;
alter table public.fraud_feedback enable row level security;
alter table public.orders enable row level security;

drop policy if exists "anon_select_predictions" on public.order_fraud_predictions;
create policy "anon_select_predictions"
on public.order_fraud_predictions
for select
to anon
using (true);

drop policy if exists "anon_write_predictions" on public.order_fraud_predictions;
create policy "anon_write_predictions"
on public.order_fraud_predictions
for all
to anon
using (true)
with check (true);

drop policy if exists "anon_select_feedback" on public.fraud_feedback;
create policy "anon_select_feedback"
on public.fraud_feedback
for select
to anon
using (true);

drop policy if exists "anon_write_feedback" on public.fraud_feedback;
create policy "anon_write_feedback"
on public.fraud_feedback
for all
to anon
using (true)
with check (true);

drop policy if exists "anon_update_orders" on public.orders;
create policy "anon_update_orders"
on public.orders
for update
to anon
using (true)
with check (true);

grant usage on schema public to anon;
grant select, insert, update on table public.orders to anon;
grant select, insert, update on table public.order_fraud_predictions to anon;
grant select, insert, update on table public.fraud_feedback to anon;
