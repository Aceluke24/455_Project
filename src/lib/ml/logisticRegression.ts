import type { LogRegParams } from "./types";

function sigmoid(z: number): number {
  if (z > 500) return 1;
  if (z < -500) return 0;
  return 1 / (1 + Math.exp(-z));
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export interface LogRegOptions {
  C?: number;
  maxIter?: number;
  learningRate?: number;
  balancedClassWeight?: boolean;
  tol?: number;
}

export function fitLogisticRegression(
  X: number[][],
  y: number[],
  options: LogRegOptions = {}
): LogRegParams {
  const {
    C = 0.1,
    maxIter = 3000,
    learningRate = 0.05,
    balancedClassWeight = true,
    tol = 1e-6,
  } = options;

  const n = X.length;
  const d = X[0].length;
  const weights = new Array(d).fill(0);
  let bias = 0;

  let w0 = 1;
  let w1 = 1;
  if (balancedClassWeight && n > 0) {
    const posCount = y.filter((v) => v === 1).length;
    const negCount = n - posCount;
    if (posCount > 0 && negCount > 0) {
      w1 = n / (2 * posCount);
      w0 = n / (2 * negCount);
    }
  }

  const lambda = 1 / C;
  let prevLoss = Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;
    let loss = 0;

    for (let i = 0; i < n; i++) {
      const z = dotProduct(X[i], weights) + bias;
      const p = sigmoid(z);
      const sw = y[i] === 1 ? w1 : w0;
      const err = (p - y[i]) * sw;

      for (let j = 0; j < d; j++) gradW[j] += err * X[i][j];
      gradB += err;

      const cp = Math.max(1e-15, Math.min(1 - 1e-15, p));
      loss -= sw * (y[i] * Math.log(cp) + (1 - y[i]) * Math.log(1 - cp));
    }

    for (let j = 0; j < d; j++) gradW[j] = gradW[j] / n + lambda * weights[j];
    gradB /= n;
    loss = loss / n;

    let regTerm = 0;
    for (let j = 0; j < d; j++) regTerm += weights[j] * weights[j];
    loss += (lambda / 2) * regTerm;

    for (let j = 0; j < d; j++) weights[j] -= learningRate * gradW[j];
    bias -= learningRate * gradB;

    if (Math.abs(prevLoss - loss) < tol) break;
    prevLoss = loss;
  }

  return { weights, bias, featureCount: d };
}

export function predictProba(X: number[][], params: LogRegParams): number[] {
  return X.map((row) => sigmoid(dotProduct(row, params.weights) + params.bias));
}

export function predict(X: number[][], params: LogRegParams, threshold = 0.5): number[] {
  return predictProba(X, params).map((p) => (p >= threshold ? 1 : 0));
}
