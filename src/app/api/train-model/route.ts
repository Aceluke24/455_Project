import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabaseServer";
import { trainModel } from "@/lib/ml/trainer";
import { setModel } from "@/lib/ml/predictor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const supabase = getServerSupabaseClient();
    const result = await trainModel(supabase);

    setModel(result.artifact);

    return NextResponse.json({
      ok: true,
      modelName: result.artifact.modelName,
      threshold: Math.round(result.threshold * 10000) / 10000,
      trainRows: result.trainRows,
      testRows: result.testRows,
      metrics: {
        accuracy: Math.round(result.metrics.accuracy * 10000) / 10000,
        precision: Math.round(result.metrics.precision * 10000) / 10000,
        recall: Math.round(result.metrics.recall * 10000) / 10000,
        f1: Math.round(result.metrics.f1 * 10000) / 10000,
        rocAuc: Math.round(result.metrics.rocAuc * 10000) / 10000,
        prAuc: Math.round(result.metrics.prAuc * 10000) / 10000,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Training failed." },
      { status: 500 }
    );
  }
}
