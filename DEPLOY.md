# Deploy + Smoke Test

## Vercel Deploy
1. Create a GitHub repo with this app folder.
2. Import repo into Vercel.
3. Add environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy and open the generated `*.vercel.app` URL.

## Smoke Test (3 submissions)
Use these sample values in the form:

- `customer_id`: existing id from `customers`
- `order_datetime`: `2026-03-26T18:30:00`
- `payment_method`: `card`
- `device_type`: `desktop`
- `ip_country`: `US`
- `promo_used`: `0`
- `order_subtotal`: `50.00`
- `shipping_fee`: `5.00`
- `tax_amount`: `4.50`
- `order_total`: `59.50`
- `risk_score`: `7.5`
- `is_fraud`: `0`

Repeat with different values 3 times, then verify in Supabase:

```sql
select order_id, customer_id, order_datetime, order_total
from public.orders
order by order_id desc
limit 3;
```
