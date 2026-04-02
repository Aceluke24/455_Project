# Basic Supabase + Vercel Order App

Simple class app that inserts one row into the `orders` table from `shop.db`.

## Scope
- Public form (no auth)
- Writes to `orders` only
- Uses Supabase for DB and Vercel for hosting

## 1) Install and run locally
```bash
npm install
cp .env.example .env.local
# Fill env vars in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 2) Supabase setup
Follow `supabase/README.md` and run SQL in `supabase/rls_orders.sql`.

## 3) Vercel deployment
1. Push this folder to a GitHub repo.
2. In Vercel, import the repo.
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy.

You will get a default `*.vercel.app` URL.

## 4) Smoke test
- Submit at least 3 orders in the deployed app.
- Confirm rows in Supabase table `orders`.

## 5) Chapter 17 analysis + predictive pipelines
- See `ml_pipeline/README.md`.
- This includes ETL, model training, model serialization, inference write-back, and scheduled-job pattern.

## 6) App integration for scoring
- `/admin`: reviews all orders, shows predictions, and lets admin mark actual fraud labels.
- `/api/predict-order`: auto-scores each newly created order and writes to prediction/feedback tables.
- The older `/scoring` and `/fraud-queue` pages were removed in favor of the simpler Order + Admin workflow.
