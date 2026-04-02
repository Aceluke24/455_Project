import { NextResponse } from "next/server";

export const runtime = "nodejs";
import { execFileSync } from "child_process";
import { getServerSupabaseClient } from "@/lib/supabaseServer";
import { runBatchInference } from "@/lib/orderScoring";

/**
 * Batch-scores every order using the same rule-based model as POST /api/predict-order
 * (deployable on Vercel). Optional: set RUN_PYTHON_ML_AFTER_SCORING=1 locally to also run
 * `python -m ml_pipeline.jobs.run_inference` against your SQLite shop.db (offline pipeline).
 */
export async function POST() {
  try {
    const supabase = getServerSupabaseClient();
    const batch = await runBatchInference(supabase);

    if (!batch.ok) {
      return NextResponse.json({ ok: false, message: batch.message }, { status: 500 });
    }

    let pythonNote: string | undefined;

    if (process.env.RUN_PYTHON_ML_AFTER_SCORING === "1") {
      try {
        execFileSync("python3", ["-m", "ml_pipeline.jobs.run_inference"], {
          cwd: process.cwd(),
          stdio: "pipe",
        });
        pythonNote = "Python ml_pipeline.jobs.run_inference completed (local SQLite).";
      } catch (e) {
        pythonNote =
          e instanceof Error
            ? `Python inference skipped or failed: ${e.message}`
            : "Python inference skipped or failed.";
      }
    }

    return NextResponse.json({
      ok: true,
      scored: batch.scored,
      orderCount: batch.orderCount,
      ...(pythonNote ? { pythonNote } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Run scoring failed.",
      },
      { status: 500 }
    );
  }
}
