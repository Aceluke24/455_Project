import type { FeatureRow, PreprocessorParams } from "./types";

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mostFrequentOf(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = "";
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) { best = val; bestCount = count; }
  }
  return best;
}

function meanOf(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdOf(values: number[], mu: number): number {
  if (values.length <= 1) return 1;
  const variance = values.reduce((s, v) => s + (v - mu) ** 2, 0) / values.length;
  return Math.sqrt(variance) || 1;
}

export function classifyColumns(
  rows: FeatureRow[],
  featureCols: string[]
): { numericCols: string[]; categoricalCols: string[] } {
  const numericCols: string[] = [];
  const categoricalCols: string[] = [];

  for (const col of featureCols) {
    let isNumeric = true;
    for (const row of rows) {
      const v = row[col];
      if (v != null && typeof v !== "number") { isNumeric = false; break; }
    }
    if (isNumeric) numericCols.push(col);
    else categoricalCols.push(col);
  }

  return { numericCols, categoricalCols };
}

export function fitPreprocessor(rows: FeatureRow[], featureCols: string[]): PreprocessorParams {
  const { numericCols, categoricalCols } = classifyColumns(rows, featureCols);

  const medians: Record<string, number> = {};
  const means: Record<string, number> = {};
  const stds: Record<string, number> = {};
  const mostFrequent: Record<string, string> = {};
  const categories: Record<string, string[]> = {};

  for (const col of numericCols) {
    const vals = rows
      .map((r) => r[col])
      .filter((v) => v != null && typeof v === "number" && isFinite(v)) as number[];
    medians[col] = medianOf(vals);
    means[col] = meanOf(vals);
    stds[col] = stdOf(vals, means[col]);
  }

  for (const col of categoricalCols) {
    const vals = rows
      .map((r) => r[col])
      .filter((v) => v != null && typeof v === "string") as string[];
    mostFrequent[col] = mostFrequentOf(vals);
    categories[col] = [...new Set(vals)].sort();
  }

  return { numericCols, categoricalCols, medians, means, stds, mostFrequent, categories };
}

export function transform(rows: FeatureRow[], params: PreprocessorParams): number[][] {
  return rows.map((row) => {
    const vec: number[] = [];

    for (const col of params.numericCols) {
      let v = row[col];
      if (v == null || typeof v !== "number" || !isFinite(v)) v = params.medians[col];
      vec.push(((v as number) - params.means[col]) / params.stds[col]);
    }

    for (const col of params.categoricalCols) {
      let v = row[col];
      if (v == null || typeof v !== "string") v = params.mostFrequent[col];
      for (const cat of params.categories[col]) vec.push(v === cat ? 1 : 0);
    }

    return vec;
  });
}
