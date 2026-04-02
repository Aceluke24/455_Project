import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;
import { getServerSupabaseClient } from "@/lib/supabaseServer";
import { runBatchInference } from "@/lib/orderScoring";

export async function POST() {
  try {
    const supabase = getServerSupabaseClient();
    const batch = await runBatchInference(supabase);

    if (!batch.ok) {
      return NextResponse.json({ ok: false, message: batch.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      scored: batch.scored,
      orderCount: batch.orderCount,
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
