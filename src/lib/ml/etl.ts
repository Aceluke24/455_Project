import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeatureRow } from "./types";

async function fetchAll<T>(supabase: SupabaseClient, table: string, select = "*"): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`ETL fetch ${table}: ${error.message}`);
    const chunk = (data ?? []) as T[];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

interface OrderRow {
  order_id: number; customer_id: number; order_datetime: string;
  billing_zip: string | null; shipping_zip: string | null; shipping_state: string | null;
  payment_method: string; device_type: string; ip_country: string;
  promo_used: number; promo_code: string | null;
  order_subtotal: number; shipping_fee: number; tax_amount: number; order_total: number;
  risk_score: number; is_fraud: number;
}

interface CustomerRow {
  customer_id: number; full_name: string; email: string;
  gender: string; birthdate: string; created_at: string;
  city: string | null; state: string | null; zip_code: string | null;
  customer_segment: string | null; loyalty_tier: string | null; is_active: number;
}

interface OrderItemRow {
  order_item_id: number; order_id: number; product_id: number;
  quantity: number; unit_price: number; line_total: number;
}

interface ProductRow {
  product_id: number; sku: string; product_name: string; category: string;
  price: number; cost: number; is_active: number;
}

interface ShipmentRow {
  shipment_id: number; order_id: number; ship_datetime: string;
  carrier: string; shipping_method: string; distance_band: string;
  promised_days: number; actual_days: number; late_delivery: number;
}

interface FeedbackRow {
  order_id: number; actual_is_fraud: number | null;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export interface EtlResult {
  rows: FeatureRow[];
  labels: number[];
  orderIds: number[];
}

const DROP_COLS = new Set([
  "order_id", "customer_id", "full_name", "email", "promo_code",
  "order_datetime", "ship_datetime", "created_at", "birthdate", "risk_score",
  "actual_days", "late_delivery",
  "billing_zip", "shipping_zip", "city", "zip_code",
]);

export async function buildFeatureDataset(supabase: SupabaseClient): Promise<EtlResult> {
  const [orders, customers, orderItems, products, shipments, feedback] = await Promise.all([
    fetchAll<OrderRow>(supabase, "orders"),
    fetchAll<CustomerRow>(supabase, "customers"),
    fetchAll<OrderItemRow>(supabase, "order_items"),
    fetchAll<ProductRow>(supabase, "products"),
    fetchAll<ShipmentRow>(supabase, "shipments"),
    fetchAll<FeedbackRow>(supabase, "fraud_feedback", "order_id, actual_is_fraud"),
  ]);

  const customerMap = new Map(customers.map((c) => [c.customer_id, c]));
  const productMap = new Map(products.map((p) => [p.product_id, p]));
  const feedbackMap = new Map(feedback.map((f) => [f.order_id, f]));

  const itemAgg = new Map<number, {
    item_count: number; total_quantity: number; unique_products: Set<number>;
    unique_categories: Set<string>; unit_prices: number[]; line_totals: number[];
    margins: number[];
  }>();
  for (const item of orderItems) {
    let agg = itemAgg.get(item.order_id);
    if (!agg) {
      agg = { item_count: 0, total_quantity: 0, unique_products: new Set(), unique_categories: new Set(), unit_prices: [], line_totals: [], margins: [] };
      itemAgg.set(item.order_id, agg);
    }
    agg.item_count++;
    agg.total_quantity += item.quantity;
    agg.unique_products.add(item.product_id);
    agg.unit_prices.push(item.unit_price);
    agg.line_totals.push(item.line_total);
    const prod = productMap.get(item.product_id);
    if (prod) {
      agg.unique_categories.add(prod.category);
      agg.margins.push(prod.price - prod.cost);
    }
  }

  const shipMap = new Map<number, ShipmentRow>();
  for (const s of shipments) shipMap.set(s.order_id, s);

  const ordersByCustomer = new Map<number, number[]>();
  const sortedOrders = [...orders].sort((a, b) => {
    if (a.customer_id !== b.customer_id) return a.customer_id - b.customer_id;
    return a.order_datetime.localeCompare(b.order_datetime);
  });
  for (const o of sortedOrders) {
    let arr = ordersByCustomer.get(o.customer_id);
    if (!arr) { arr = []; ordersByCustomer.set(o.customer_id, arr); }
    arr.push(o.order_id);
  }
  const priorOrderCountMap = new Map<number, number>();
  for (const arr of ordersByCustomer.values()) {
    for (let i = 0; i < arr.length; i++) priorOrderCountMap.set(arr[i], i);
  }

  const rows: FeatureRow[] = [];
  const labels: number[] = [];
  const orderIds: number[] = [];

  for (const order of sortedOrders) {
    const cust = customerMap.get(order.customer_id);
    const items = itemAgg.get(order.order_id);
    const ship = shipMap.get(order.order_id);
    const fb = feedbackMap.get(order.order_id);

    const orderDt = parseDate(order.order_datetime);
    const custCreated = cust ? parseDate(cust.created_at) : null;
    const custBirth = cust ? parseDate(cust.birthdate) : null;

    const label = fb?.actual_is_fraud != null ? fb.actual_is_fraud : order.is_fraud;

    const sumLineTotals = items ? items.line_totals.reduce((a, b) => a + b, 0) : 0;
    const avgMargin = items && items.margins.length > 0
      ? items.margins.reduce((a, b) => a + b, 0) / items.margins.length : 0;
    const totalMargin = items ? items.margins.reduce((a, b) => a + b, 0) : 0;
    const itemCount = items?.item_count ?? 0;

    const row: FeatureRow = {
      shipping_state: order.shipping_state,
      payment_method: order.payment_method,
      device_type: order.device_type,
      ip_country: order.ip_country,
      promo_used: order.promo_used,
      order_subtotal: order.order_subtotal,
      shipping_fee: order.shipping_fee,
      tax_amount: order.tax_amount,
      order_total: order.order_total,

      gender: cust?.gender ?? null,
      state: cust?.state ?? null,
      customer_segment: cust?.customer_segment ?? null,
      loyalty_tier: cust?.loyalty_tier ?? null,
      is_active: cust?.is_active ?? null,

      item_count: itemCount,
      total_quantity: items?.total_quantity ?? 0,
      unique_products: items ? items.unique_products.size : 0,
      unique_categories: items ? items.unique_categories.size : 0,
      mean_unit_price: items && items.unit_prices.length > 0
        ? items.unit_prices.reduce((a, b) => a + b, 0) / items.unit_prices.length : 0,
      sum_line_total: sumLineTotals,
      avg_item_margin: avgMargin,
      total_item_margin: totalMargin,

      carrier: ship?.carrier ?? null,
      shipping_method: ship?.shipping_method ?? null,
      distance_band: ship?.distance_band ?? null,
      promised_days: ship?.promised_days ?? null,

      order_hour: orderDt ? orderDt.getUTCHours() : 0,
      order_dayofweek: orderDt ? orderDt.getUTCDay() : 0,
      order_month: orderDt ? orderDt.getUTCMonth() + 1 : 1,
      is_weekend_order: orderDt ? (orderDt.getUTCDay() === 0 || orderDt.getUTCDay() === 6 ? 1 : 0) : 0,
      customer_tenure_days: orderDt && custCreated ? Math.round(daysBetween(orderDt, custCreated)) : 0,
      customer_age_years: orderDt && custBirth
        ? Math.round((daysBetween(orderDt, custBirth) / 365.25) * 10) / 10 : null,
      zip_mismatch: (order.billing_zip ?? "UNK") !== (order.shipping_zip ?? "UNK") ? 1 : 0,
      ip_domestic_us: (order.ip_country ?? "").toUpperCase() === "US" ? 1 : 0,
      state_matches_customer:
        (order.shipping_state ?? "UNK").toUpperCase() === (cust?.state ?? "UNK").toUpperCase() ? 1 : 0,
      total_to_subtotal_ratio: order.order_subtotal !== 0
        ? order.order_total / order.order_subtotal : null,
      avg_item_value: itemCount > 0 ? sumLineTotals / itemCount : null,
      prior_order_count: priorOrderCountMap.get(order.order_id) ?? 0,
      first_order_flag: (priorOrderCountMap.get(order.order_id) ?? 0) === 0 ? 1 : 0,
    };

    rows.push(row);
    labels.push(label);
    orderIds.push(order.order_id);
  }

  return { rows, labels, orderIds };
}

export function getFeatureColumns(rows: FeatureRow[]): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).filter((k) => !DROP_COLS.has(k));
}
