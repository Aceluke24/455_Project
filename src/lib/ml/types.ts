export type FeatureRow = Record<string, number | string | null>;

export interface TrainTestSplit {
  xTrain: FeatureRow[];
  xTest: FeatureRow[];
  yTrain: number[];
  yTest: number[];
}

export interface PreprocessorParams {
  numericCols: string[];
  categoricalCols: string[];
  medians: Record<string, number>;
  means: Record<string, number>;
  stds: Record<string, number>;
  mostFrequent: Record<string, string>;
  categories: Record<string, string[]>;
}

export interface LogRegParams {
  weights: number[];
  bias: number;
  featureCount: number;
}

export interface ModelArtifact {
  createdAt: string;
  modelName: string;
  preprocessor: PreprocessorParams;
  logReg: LogRegParams;
  threshold: number;
  featureColumns: string[];
  metrics: TrainMetrics;
  trainRows: number;
  testRows: number;
}

export interface TrainMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number;
  prAuc: number;
}
