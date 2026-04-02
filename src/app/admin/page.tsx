"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type JoinedOrderRow = {
  order_id: number;
  customer_id: number;
  order_datetime: string;
  order_total: number;
  is_fraud: number;
  order_fraud_predictions: {
    fraud_probability: number;
    predicted_is_fraud: number;
    model_version: string | null;
    prediction_timestamp: string;
  } | null;
  fraud_feedback: {
    actual_is_fraud: number | null;
    is_prediction_correct: number | null;
    reviewed_at: string | null;
  } | null;
};

type AdminRow = {
  order_id: number;
  customer_id: number;
  order_datetime: string;
  order_total: number;
  base_is_fraud: number;
  predicted_is_fraud: number | null;
  fraud_probability: number | null;
  model_version: string | null;
  prediction_timestamp: string | null;
  actual_is_fraud: number | null;
  is_prediction_correct: number | null;
  reviewed_at: string | null;
};

export default function AdminPage() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoringMessage, setScoringMessage] = useState<string | null>(null);
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState<{
    threshold: number;
    trainRows: number;
    testRows: number;
    metrics: { accuracy: number; precision: number; recall: number; f1: number; rocAuc: number; prAuc: number };
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();

      const { data, error: qErr } = await supabase
        .from("orders")
        .select(`
          order_id, customer_id, order_datetime, order_total, is_fraud,
          order_fraud_predictions(fraud_probability, predicted_is_fraud, model_version, prediction_timestamp),
          fraud_feedback(actual_is_fraud, is_prediction_correct, reviewed_at)
        `)
        .order("order_id", { ascending: false })
        .limit(200);

      if (qErr) throw new Error(qErr.message);

      const joined = (data as JoinedOrderRow[]) ?? [];
      setRows(
        joined.map((o) => ({
          order_id: o.order_id,
          customer_id: o.customer_id,
          order_datetime: o.order_datetime,
          order_total: o.order_total,
          base_is_fraud: o.is_fraud,
          predicted_is_fraud: o.order_fraud_predictions?.predicted_is_fraud ?? null,
          fraud_probability: o.order_fraud_predictions?.fraud_probability ?? null,
          model_version: o.order_fraud_predictions?.model_version ?? null,
          prediction_timestamp: o.order_fraud_predictions?.prediction_timestamp ?? null,
          actual_is_fraud: o.fraud_feedback?.actual_is_fraud ?? null,
          is_prediction_correct: o.fraud_feedback?.is_prediction_correct ?? null,
          reviewed_at: o.fraud_feedback?.reviewed_at ?? null,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed loading admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  /** Orders that still need a fraud decision before fulfillment (highest model risk first). */
  const verificationQueue = useMemo(() => {
    return rows
      .filter((r) => r.actual_is_fraud === null)
      .sort((a, b) => {
        const ap = a.fraud_probability ?? -1;
        const bp = b.fraud_probability ?? -1;
        return bp - ap;
      });
  }, [rows]);

  const retrainModel = async () => {
    setTraining(true);
    setError(null);
    try {
      const res = await fetch("/api/train-model", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.message ?? "Training failed.");
      setTrainResult({
        threshold: body.threshold,
        trainRows: body.trainRows,
        testRows: body.testRows,
        metrics: body.metrics,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Training failed.");
    } finally {
      setTraining(false);
    }
  };

  const runScoring = async () => {
    setScoring(true);
    setScoringMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/run-scoring", { method: "POST" });
      const body = (await res.json()) as {
        ok?: boolean;
        message?: string;
        scored?: number;
        orderCount?: number;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.message ?? "Run scoring failed.");
      }
      setScoringMessage(`Scored ${body.scored ?? 0} of ${body.orderCount ?? 0} orders.`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run scoring failed.");
    } finally {
      setScoring(false);
    }
  };

  const saveActualLabel = async (order: AdminRow, actual: number) => {
    setSavingId(order.order_id);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const is_prediction_correct =
        order.predicted_is_fraud == null ? null : Number(order.predicted_is_fraud === actual);

      const { error } = await supabase.from("fraud_feedback").upsert(
        [
          {
            order_id: order.order_id,
            predicted_is_fraud: order.predicted_is_fraud,
            fraud_probability: order.fraud_probability,
            actual_is_fraud: actual,
            reviewed_by: "admin",
            reviewed_at: new Date().toISOString(),
            is_prediction_correct,
          },
        ],
        { onConflict: "order_id" }
      );

      if (error) throw new Error(error.message);

      const { error: orderUpdateError } = await supabase
        .from("orders")
        .update({ is_fraud: actual })
        .eq("order_id", order.order_id);

      if (orderUpdateError) throw new Error(orderUpdateError.message);

      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed saving review.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main>
      <h1>Admin · Fraud review</h1>
      <p>Run batch scoring on all orders, then work the verification queue before fulfilling high-risk orders.</p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div className="plain-card" style={{ flex: 1, minWidth: 280 }}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>1. Train / Retrain model</h2>
          <p style={{ marginTop: 0 }}>
            Pulls all orders + feedback from Supabase, engineers features, trains a logistic regression model,
            and selects an optimal threshold. The model is held in memory for scoring.
          </p>
          <button type="button" onClick={() => void retrainModel()} disabled={training || loading}>
            {training ? "Training…" : "Train model"}
          </button>
          {trainResult && (
            <div className="status ok" style={{ marginTop: 12 }}>
              <strong>Model trained</strong> (threshold {trainResult.threshold})<br />
              Train: {trainResult.trainRows} rows · Test: {trainResult.testRows} rows<br />
              Accuracy {trainResult.metrics.accuracy} · Precision {trainResult.metrics.precision} · Recall{" "}
              {trainResult.metrics.recall} · F1 {trainResult.metrics.f1}<br />
              ROC-AUC {trainResult.metrics.rocAuc} · PR-AUC {trainResult.metrics.prAuc}
            </div>
          )}
        </div>

        <div className="plain-card" style={{ flex: 1, minWidth: 280 }}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>2. Run batch scoring</h2>
          <p style={{ marginTop: 0 }}>
            Scores every order using the trained model (or rule-based fallback if no model is trained yet).
          </p>
          <button type="button" onClick={() => void runScoring()} disabled={scoring || loading}>
            {scoring ? "Running…" : "Run scoring"}
          </button>
          {scoringMessage && <div className="status ok" style={{ marginTop: 12 }}>{scoringMessage}</div>}
        </div>
      </div>

      {loading && <p>Loading admin table...</p>}
      {error && <div className="status error">{error}</div>}

      {!loading && !error && (
        <>
          <h2 style={{ fontSize: "1.1rem" }}>Verification queue (pending review)</h2>
          <p style={{ marginTop: 0 }}>
            Orders without an &quot;actual&quot; fraud label yet, highest model probability first.
          </p>
          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Predicted</th>
                  <th>Probability</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {verificationQueue.map((row) => (
                  <tr key={`q-${row.order_id}`}>
                    <td>{row.order_id}</td>
                    <td>{row.customer_id}</td>
                    <td>{new Date(row.order_datetime).toLocaleString()}</td>
                    <td>{row.order_total.toFixed(2)}</td>
                    <td>
                      {row.predicted_is_fraud == null
                        ? "—"
                        : row.predicted_is_fraud === 1
                          ? "Fraud"
                          : "Not fraud"}
                    </td>
                    <td>
                      {row.fraud_probability == null ? "—" : `${(row.fraud_probability * 100).toFixed(1)}%`}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          disabled={savingId === row.order_id}
                          onClick={() => saveActualLabel(row, 0)}
                        >
                          Clear (not fraud)
                        </button>
                        <button
                          type="button"
                          disabled={savingId === row.order_id}
                          onClick={() => saveActualLabel(row, 1)}
                        >
                          Confirm fraud
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {verificationQueue.length === 0 && (
                  <tr>
                    <td colSpan={7}>No orders awaiting review.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: "1.1rem" }}>All orders · fraud detail</h2>
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Total</th>
                <th>Predicted</th>
                <th>Probability</th>
                <th>Actual</th>
                <th>Correct?</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.order_id}>
                  <td>{row.order_id}</td>
                  <td>{row.customer_id}</td>
                  <td>{new Date(row.order_datetime).toLocaleString()}</td>
                  <td>{row.order_total.toFixed(2)}</td>
                  <td>
                    {row.predicted_is_fraud == null ? "-" : row.predicted_is_fraud === 1 ? "Fraud" : "Not Fraud"}
                  </td>
                  <td>{row.fraud_probability == null ? "-" : `${(row.fraud_probability * 100).toFixed(1)}%`}</td>
                  <td>{row.actual_is_fraud == null ? "-" : row.actual_is_fraud === 1 ? "Fraud" : "Not Fraud"}</td>
                  <td>
                    {row.is_prediction_correct == null
                      ? "-"
                      : row.is_prediction_correct === 1
                        ? "Yes"
                        : "No"}
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        disabled={savingId === row.order_id}
                        onClick={() => saveActualLabel(row, 0)}
                      >
                        Mark Not Fraud
                      </button>
                      <button
                        type="button"
                        disabled={savingId === row.order_id}
                        onClick={() => saveActualLabel(row, 1)}
                      >
                        Mark Fraud
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9}>No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
    </main>
  );
}
