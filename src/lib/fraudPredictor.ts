import { getModel } from "@/lib/ml/predictor";
import { predictSingle, type PredictionResult } from "@/lib/ml/predictor";
import type { FeatureRow } from "@/lib/ml/types";

export type OrderForPrediction = {
  order_total: number;
  order_subtotal: number;
  shipping_fee: number;
  tax_amount: number;
  promo_used: number;
  payment_method: string;
  device_type: string;
  ip_country: string;
  shipping_state?: string | null;
};

function ruleBased(order: OrderForPrediction): PredictionResult {
  let score = -2.2;
  if (order.order_total > 300) score += 0.8;
  if (order.order_total > 600) score += 0.7;
  if (order.promo_used === 1) score += 0.35;
  if (order.payment_method === "crypto") score += 0.65;
  if (order.device_type === "mobile") score += 0.2;
  if (order.ip_country !== "US") score += 0.4;
  if (!order.shipping_state || order.shipping_state.trim() === "") score += 0.15;
  const feeRatio = order.order_total > 0 ? order.shipping_fee / order.order_total : 0;
  if (feeRatio > 0.2) score += 0.25;
  const taxRatio = order.order_subtotal > 0 ? order.tax_amount / order.order_subtotal : 0;
  if (taxRatio < 0.02 || taxRatio > 0.2) score += 0.2;
  const fraud_probability = 1 / (1 + Math.exp(-score));
  return { fraud_probability, predicted_is_fraud: fraud_probability >= 0.5 ? 1 : 0 };
}

export function predictFraud(order: OrderForPrediction): PredictionResult {
  const model = getModel();
  if (!model) return ruleBased(order);

  const row: FeatureRow = {
    order_total: order.order_total,
    order_subtotal: order.order_subtotal,
    shipping_fee: order.shipping_fee,
    tax_amount: order.tax_amount,
    promo_used: order.promo_used,
    payment_method: order.payment_method,
    device_type: order.device_type,
    ip_country: order.ip_country,
    shipping_state: order.shipping_state ?? null,
    item_count: 0,
    total_quantity: 0,
    unique_products: 0,
    unique_categories: 0,
    mean_unit_price: 0,
    sum_line_total: 0,
    avg_item_margin: 0,
    total_item_margin: 0,
    order_hour: new Date().getUTCHours(),
    order_dayofweek: new Date().getUTCDay(),
    order_month: new Date().getUTCMonth() + 1,
    is_weekend_order: new Date().getUTCDay() === 0 || new Date().getUTCDay() === 6 ? 1 : 0,
    customer_tenure_days: 0,
    zip_mismatch: 0,
    ip_domestic_us: (order.ip_country ?? "").toUpperCase() === "US" ? 1 : 0,
    state_matches_customer: 0,
    total_to_subtotal_ratio: order.order_subtotal !== 0
      ? order.order_total / order.order_subtotal : null,
    avg_item_value: null,
    prior_order_count: 0,
    first_order_flag: 1,
  };

  return predictSingle(row, model);
}
