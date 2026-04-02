import type { SupabaseClient } from "@supabase/supabase-js";
import { predictFraud, type OrderForPrediction } from "@/lib/fraudPredictor";

import { getModel } from "@/lib/ml/predictor";

export const SCORING_MODEL_NAME = "fraud_pipeline_js";
export const SCORING_MODEL_VERSION = "1.0.0";

export function currentModelName(): string {
  const m = getModel();
  return m ? m.modelName : "rule_based_v1_fallback";
}

export type PredictOrderPayload = {
  order_id: number;
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

function toOrderForPrediction(payload: PredictOrderPayload): OrderForPrediction {
  return {
    order_total: payload.order_total,
    order_subtotal: payload.order_subtotal,
    shipping_fee: payload.shipping_fee,
    tax_amount: payload.tax_amount,
    promo_used: payload.promo_used,
    payment_method: payload.payment_method,
    device_type: payload.device_type,
    ip_country: payload.ip_country,
    shipping_state: payload.shipping_state,
  };
}

export async function upsertPredictionForOrder(
  supabase: SupabaseClient,
  payload: PredictOrderPayload
): Promise<{ fraud_probability: number; predicted_is_fraud: number } | { error: string }> {
  const { fraud_probability, predicted_is_fraud } = predictFraud(toOrderForPrediction(payload));
  const timestamp = new Date().toISOString();

  const { error: predictionError } = await supabase.from("order_fraud_predictions").upsert(
    [
      {
        order_id: payload.order_id,
        fraud_probability,
        predicted_is_fraud,
        model_name: SCORING_MODEL_NAME,
        model_version: SCORING_MODEL_VERSION,
        prediction_timestamp: timestamp,
      },
    ],
    { onConflict: "order_id" }
  );

  if (predictionError) {
    return { error: predictionError.message };
  }

  return { fraud_probability, predicted_is_fraud };
}

export type OrderRowForBatch = {
  order_id: number;
  order_total: number;
  order_subtotal: number;
  shipping_fee: number;
  tax_amount: number;
  promo_used: number;
  payment_method: string;
  device_type: string;
  ip_country: string;
  shipping_state: string | null;
};

const BATCH_SELECT =
  "order_id, order_total, order_subtotal, shipping_fee, tax_amount, promo_used, payment_method, device_type, ip_country, shipping_state";

export async function runBatchInference(supabase: SupabaseClient): Promise<
  | { ok: true; scored: number; orderCount: number }
  | { ok: false; message: string }
> {
  const pageSize = 500;
  let from = 0;
  const allRows: OrderRowForBatch[] = [];

  for (;;) {
    const { data, error } = await supabase
      .from("orders")
      .select(BATCH_SELECT)
      .order("order_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      return { ok: false, message: error.message };
    }

    const chunk = (data as OrderRowForBatch[]) ?? [];
    allRows.push(...chunk);
    if (chunk.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  const timestamp = new Date().toISOString();
  const predictionRows: {
    order_id: number; fraud_probability: number; predicted_is_fraud: number;
    model_name: string; model_version: string; prediction_timestamp: string;
  }[] = [];
  for (const row of allRows) {
    const { fraud_probability, predicted_is_fraud } = predictFraud({
      order_total: Number(row.order_total),
      order_subtotal: Number(row.order_subtotal),
      shipping_fee: Number(row.shipping_fee),
      tax_amount: Number(row.tax_amount),
      promo_used: Number(row.promo_used),
      payment_method: row.payment_method,
      device_type: row.device_type,
      ip_country: row.ip_country,
      shipping_state: row.shipping_state,
    });
    predictionRows.push({
      order_id: row.order_id, fraud_probability, predicted_is_fraud,
      model_name: SCORING_MODEL_NAME, model_version: SCORING_MODEL_VERSION,
      prediction_timestamp: timestamp,
    });
  }

  const CHUNK = 500;
  for (let i = 0; i < predictionRows.length; i += CHUNK) {
    const { error: pErr } = await supabase
      .from("order_fraud_predictions")
      .upsert(predictionRows.slice(i, i + CHUNK), { onConflict: "order_id" });
    if (pErr) return { ok: false, message: pErr.message };
  }

  return { ok: true, scored: allRows.length, orderCount: allRows.length };
}
