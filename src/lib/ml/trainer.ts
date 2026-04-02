import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFeatureDataset, getFeatureColumns } from "./etl";
import { fitPreprocessor, transform } from "./preprocessing";
import { fitLogisticRegression, predictProba } from "./logisticRegression";
import type { ModelArtifact, TrainMetrics, FeatureRow } from "./types";

function stratifiedSplit(
  rows: FeatureRow[], labels: number[], testSize: number, seed: number
): { xTrain: FeatureRow[]; xTest: FeatureRow[]; yTrain: number[]; yTest: number[] } {
  const pos: number[] = [];
  const neg: number[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === 1) pos.push(i);
    else neg.push(i);
  }

  function seededShuffle(arr: number[]) {
    let s = seed;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      const j = s % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  seededShuffle(pos);
  seededShuffle(neg);

  const posTestCount = Math.max(1, Math.round(pos.length * testSize));
  const negTestCount = Math.max(1, Math.round(neg.length * testSize));

  const testIndices = new Set([
    ...pos.slice(0, posTestCount),
    ...neg.slice(0, negTestCount),
  ]);

  const xTrain: FeatureRow[] = [];
  const xTest: FeatureRow[] = [];
  const yTrain: number[] = [];
  const yTest: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    if (testIndices.has(i)) {
      xTest.push(rows[i]);
      yTest.push(labels[i]);
    } else {
      xTrain.push(rows[i]);
      yTrain.push(labels[i]);
    }
  }

  return { xTrain, xTest, yTrain, yTest };
}

function computeMetrics(yTrue: number[], yProba: number[], threshold: number): TrainMetrics {
  const yPred = yProba.map((p) => (p >= threshold ? 1 : 0));
  let tp = 0, fp = 0, fn = 0, tn = 0;

  for (let i = 0; i < yTrue.length; i++) {
    if (yTrue[i] === 1 && yPred[i] === 1) tp++;
    else if (yTrue[i] === 0 && yPred[i] === 1) fp++;
    else if (yTrue[i] === 1 && yPred[i] === 0) fn++;
    else tn++;
  }

  const accuracy = (tp + tn) / (tp + fp + fn + tn);
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const rocAuc = computeAuc(yTrue, yProba, "roc");
  const prAuc = computeAuc(yTrue, yProba, "pr");

  return { accuracy, precision, recall, f1, rocAuc, prAuc };
}

function computeAuc(yTrue: number[], yScores: number[], kind: "roc" | "pr"): number {
  const indexed = yTrue.map((y, i) => ({ y, s: yScores[i] }));
  indexed.sort((a, b) => b.s - a.s);

  const totalPos = yTrue.filter((y) => y === 1).length;
  const totalNeg = yTrue.length - totalPos;
  if (totalPos === 0 || totalNeg === 0) return 0;

  let auc = 0;
  let tp = 0;
  let fp = 0;
  let prevTpr = 0;
  let prevFpr = 0;
  let prevPrecision = 1;
  let prevRecall = 0;

  for (let i = 0; i < indexed.length; i++) {
    if (indexed[i].y === 1) tp++;
    else fp++;

    const tpr = tp / totalPos;
    const fpr = fp / totalNeg;
    const precision = tp / (tp + fp);
    const recall = tpr;

    if (kind === "roc") {
      auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;
      prevTpr = tpr;
      prevFpr = fpr;
    } else {
      auc += (recall - prevRecall) * (precision + prevPrecision) / 2;
      prevPrecision = precision;
      prevRecall = recall;
    }
  }

  return auc;
}

function selectThreshold(yTrue: number[], yProba: number[], minRecall = 0.70): number {
  const thresholds: number[] = [];
  for (let t = 0.01; t <= 0.99; t += 0.005) thresholds.push(t);

  let bestF1 = 0;
  let bestThreshold = 0.5;

  for (const t of thresholds) {
    let tp = 0, fp = 0, fn = 0;
    for (let i = 0; i < yTrue.length; i++) {
      const pred = yProba[i] >= t ? 1 : 0;
      if (yTrue[i] === 1 && pred === 1) tp++;
      else if (yTrue[i] === 0 && pred === 1) fp++;
      else if (yTrue[i] === 1 && pred === 0) fn++;
    }
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    if (recall < minRecall) continue;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    if (f1 > bestF1) {
      bestF1 = f1;
      bestThreshold = t;
    }
  }

  return bestThreshold;
}

export interface TrainResult {
  artifact: ModelArtifact;
  metrics: TrainMetrics;
  threshold: number;
  trainRows: number;
  testRows: number;
}

export async function trainModel(supabase: SupabaseClient): Promise<TrainResult> {
  const { rows, labels } = await buildFeatureDataset(supabase);
  const featureCols = getFeatureColumns(rows);

  const { xTrain, xTest, yTrain, yTest } = stratifiedSplit(rows, labels, 0.2, 42);

  const preprocessor = fitPreprocessor(xTrain, featureCols);
  const xTrainVec = transform(xTrain, preprocessor);
  const xTestVec = transform(xTest, preprocessor);

  const logRegParams = fitLogisticRegression(xTrainVec, yTrain, {
    C: 0.1,
    maxIter: 3000,
    balancedClassWeight: true,
  });

  const trainProba = predictProba(xTrainVec, logRegParams);
  const threshold = selectThreshold(yTrain, trainProba, 0.70);

  const testProba = predictProba(xTestVec, logRegParams);
  const metrics = computeMetrics(yTest, testProba, threshold);

  const artifact: ModelArtifact = {
    createdAt: new Date().toISOString(),
    modelName: "fraud_pipeline_js",
    preprocessor,
    logReg: logRegParams,
    threshold,
    featureColumns: featureCols,
    metrics,
    trainRows: xTrain.length,
    testRows: xTest.length,
  };

  return { artifact, metrics, threshold, trainRows: xTrain.length, testRows: xTest.length };
}
