import { transform } from "./preprocessing";
import { predictProba } from "./logisticRegression";
import type { ModelArtifact, FeatureRow } from "./types";

let cachedModel: ModelArtifact | null = null;

export function setModel(artifact: ModelArtifact) {
  cachedModel = artifact;
}

export function getModel(): ModelArtifact | null {
  return cachedModel;
}

export function clearModel() {
  cachedModel = null;
}

export interface PredictionResult {
  fraud_probability: number;
  predicted_is_fraud: number;
}

export function predictSingle(row: FeatureRow, model: ModelArtifact): PredictionResult {
  const [vec] = transform([row], model.preprocessor);
  const [prob] = predictProba([vec], model.logReg);
  return {
    fraud_probability: prob,
    predicted_is_fraud: prob >= model.threshold ? 1 : 0,
  };
}

export function predictBatch(rows: FeatureRow[], model: ModelArtifact): PredictionResult[] {
  const vecs = transform(rows, model.preprocessor);
  const probs = predictProba(vecs, model.logReg);
  return probs.map((prob) => ({
    fraud_probability: prob,
    predicted_is_fraud: prob >= model.threshold ? 1 : 0,
  }));
}
