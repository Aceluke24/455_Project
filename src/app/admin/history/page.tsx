"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type OrderHistoryRow = {
  order_id: number;
  customer_id: number;
  order_datetime: string;
  billing_zip: string | null;
  shipping_zip: string | null;
  shipping_state: string | null;
  payment_method: string;
  device_type: string;
  ip_country: string;
  promo_used: number;
  promo_code: string | null;
  order_subtotal: number;
  shipping_fee: number;
  tax_amount: number;
  order_total: number;
  risk_score: number;
  is_fraud: number;
};

const ORDER_COLUMNS =
  "order_id, customer_id, order_datetime, billing_zip, shipping_zip, shipping_state, payment_method, device_type, ip_country, promo_used, promo_code, order_subtotal, shipping_fee, tax_amount, order_total, risk_score, is_fraud";

export default function AdminOrderHistoryPage() {
  const [orders, setOrders] = useState<OrderHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error: qError } = await supabase
        .from("orders")
        .select(ORDER_COLUMNS)
        .order("order_id", { ascending: false })
        .limit(500);

      if (qError) throw new Error(qError.message);
      setOrders((data as OrderHistoryRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load order history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <main>
      <h1>Order history (administrator)</h1>
      <p>
        All recent orders stored in the database. For fraud review and the verification queue, use{" "}
        <Link href="/admin">Fraud review</Link>.
      </p>

      <p>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </p>

      {loading && <p>Loading…</p>}
      {error && <div className="status error">{error}</div>}

      {!loading && !error && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>When</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Device</th>
                <th>Country</th>
                <th>Promo</th>
                <th>Risk</th>
                <th>Label fraud</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.order_id}>
                  <td>{o.order_id}</td>
                  <td>{o.customer_id}</td>
                  <td>{new Date(o.order_datetime).toLocaleString()}</td>
                  <td>{Number(o.order_total).toFixed(2)}</td>
                  <td>{o.payment_method}</td>
                  <td>{o.device_type}</td>
                  <td>{o.ip_country}</td>
                  <td>{o.promo_used === 1 ? (o.promo_code ?? "yes") : "—"}</td>
                  <td>{Number(o.risk_score).toFixed(1)}</td>
                  <td>{o.is_fraud === 1 ? "Yes" : "No"}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={10}>No orders yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
