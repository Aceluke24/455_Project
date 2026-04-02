import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabaseServer";
import { upsertPredictionForOrder, type PredictOrderPayload } from "@/lib/orderScoring";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as PredictOrderPayload;
    const supabase = getServerSupabaseClient();

    const result = await upsertPredictionForOrder(supabase, payload);
    if ("error" in result) {
      return NextResponse.json({ ok: false, message: result.error }, { status: 500 });
    }

    const { fraud_probability, predicted_is_fraud } = result;

    return NextResponse.json({
      ok: true,
      prediction: {
        predicted_is_fraud,
        fraud_probability,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Prediction failed.",
      },
      { status: 500 }
    );
  }
}
