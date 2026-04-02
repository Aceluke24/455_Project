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

export function predictFraud(order: OrderForPrediction): {
  fraud_probability: number;
  predicted_is_fraud: number;
} {
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
  const predicted_is_fraud = fraud_probability >= 0.5 ? 1 : 0;

  return {
    fraud_probability,
    predicted_is_fraud,
  };
}
