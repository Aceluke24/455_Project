# Supabase Setup (Orders-Only App)

## 1) Create a Supabase project
- In Supabase, create a new project.
- Save your project URL and anon key.

## 2) Create schema/data
- Open `shop.db` from `/Users/luke/IS455MachineLearning/Data/shop.db`.
- Export/import required tables into Supabase Postgres:
  - `customers` (needed for `customer_id` foreign key)
  - `orders` (target write table)
- Ensure `orders.customer_id` references `customers.customer_id`.

## 3) Enable RLS and policy
- In Supabase SQL editor, run `rls_orders.sql`.
- Then run `admin_fraud_workflow.sql` for predictions + admin feedback workflow.
- This enables:
  - insert/select/update for `orders` (demo scope)
  - prediction writes to `order_fraud_predictions`
  - admin review writes to `fraud_feedback`

## 4) Add env vars
- In local `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
