"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

type Status = {
  type: "ok" | "error";
  message: string;
} | null;

type CustomerRow = {
  customer_id: number;
  [key: string]: unknown;
};

function customerSubtitle(row: CustomerRow): string {
  const parts = [
    row.customer_segment,
    row.loyalty_tier,
    row.email,
    row.gender,
  ].filter((v) => v != null && String(v).trim() !== "");
  return parts.length ? parts.map(String).join(" · ") : "—";
}

const emptyForm = (customerId: string) => ({
  customer_id: customerId,
  order_datetime: "",
  billing_zip: "",
  shipping_zip: "",
  shipping_state: "",
  payment_method: "card",
  device_type: "desktop",
  ip_country: "US",
  promo_used: "0",
  promo_code: "",
  order_subtotal: "",
  shipping_fee: "",
  tax_amount: "",
  order_total: "",
  risk_score: "0",
  is_fraud: "0",
});

function PlaceOrderPageInner() {
  const searchParams = useSearchParams();

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [form, setForm] = useState(() => emptyForm(""));
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    const fromUrl = searchParams.get("customer_id");
    if (fromUrl) {
      const n = Number(fromUrl);
      if (!Number.isNaN(n) && n > 0) {
        setSelectedCustomerId(n);
        setForm(emptyForm(String(n)));
      }
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCustomersLoading(true);
      setCustomersError(null);
      try {
        const supabase = getSupabaseClient();
        const { data, error: qError } = await supabase
          .from("customers")
          .select("*")
          .order("customer_id", { ascending: true })
          .limit(1000);

        if (qError) throw new Error(qError.message);
        if (!cancelled) {
          setCustomers((data as CustomerRow[]) ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setCustomersError(e instanceof Error ? e.message : "Failed to load customers.");
        }
      } finally {
        if (!cancelled) setCustomersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const idMatch = String(c.customer_id).includes(q);
      const rest = Object.values(c)
        .filter((v) => typeof v === "string" || typeof v === "number")
        .some((v) => String(v).toLowerCase().includes(q));
      return idMatch || rest;
    });
  }, [customers, query]);

  const isPromoEnabled = useMemo(() => form.promo_used === "1", [form.promo_used]);

  const onInput = (name: string, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const selectCustomer = (id: number) => {
    setSelectedCustomerId(id);
    setStatus(null);
    setForm(emptyForm(String(id)));
    requestAnimationFrame(() => {
      document.getElementById("order-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const clearCustomer = () => {
    setSelectedCustomerId(null);
    setForm(emptyForm(""));
    setStatus(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedCustomerId == null) {
      setStatus({ type: "error", message: "Select a customer first." });
      return;
    }

    setSubmitting(true);
    setStatus(null);

    const payload = {
      customer_id: Number(form.customer_id),
      order_datetime: form.order_datetime,
      billing_zip: form.billing_zip || null,
      shipping_zip: form.shipping_zip || null,
      shipping_state: form.shipping_state || null,
      payment_method: form.payment_method,
      device_type: form.device_type,
      ip_country: form.ip_country,
      promo_used: Number(form.promo_used),
      promo_code: form.promo_code || null,
      order_subtotal: Number(form.order_subtotal),
      shipping_fee: Number(form.shipping_fee),
      tax_amount: Number(form.tax_amount),
      order_total: Number(form.order_total),
      risk_score: Number(form.risk_score),
      is_fraud: Number(form.is_fraud),
    };

    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Missing Supabase configuration.",
      });
      setSubmitting(false);
      return;
    }

    const { error, data } = await supabase.from("orders").insert([payload]).select("order_id");

    if (error) {
      setStatus({ type: "error", message: error.message });
      setSubmitting(false);
      return;
    }

    const newOrderId = data?.[0]?.order_id;

    if (newOrderId) {
      try {
        await fetch("/api/predict-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: newOrderId,
            order_total: payload.order_total,
            order_subtotal: payload.order_subtotal,
            shipping_fee: payload.shipping_fee,
            tax_amount: payload.tax_amount,
            promo_used: payload.promo_used,
            payment_method: payload.payment_method,
            device_type: payload.device_type,
            ip_country: payload.ip_country,
            shipping_state: payload.shipping_state,
          }),
        });
      } catch {
        // Keep order creation successful even if prediction write fails.
      }
    }

    setStatus({
      type: "ok",
      message: `Order saved. Order ID: ${newOrderId ?? "N/A"}`,
    });
    setForm(emptyForm(String(selectedCustomerId)));
    setSubmitting(false);
  };

  return (
    <main>
      <h1>Place an order</h1>
      <p>Pick a customer, then complete the order below. No signup or login required.</p>

      <section className="plain-card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>1. Select customer</h2>

        {customersLoading && <p>Loading customers…</p>}
        {customersError && <div className="status error">{customersError}</div>}

        {!customersLoading && !customersError && (
          <>
            <label>
              Search by ID or details
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. 12 or segment name"
                style={{ width: "100%", maxWidth: 420, marginTop: 8 }}
              />
            </label>

            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Customer ID</th>
                    <th>Details</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.customer_id}
                      style={{
                        background:
                          selectedCustomerId === row.customer_id ? "rgba(21, 94, 239, 0.08)" : undefined,
                      }}
                    >
                      <td>{row.customer_id}</td>
                      <td>{customerSubtitle(row)}</td>
                      <td>
                        <button type="button" className="btn-inline" onClick={() => selectCustomer(row.customer_id)}>
                          {selectedCustomerId === row.customer_id ? "Selected" : "Use this customer"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={3}>No customers match. Import the customers table in Supabase.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section id="order-form" className="plain-card">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>2. Order details</h2>

        {selectedCustomerId == null ? (
          <p className="muted">Select a customer above to enable the form.</p>
        ) : (
          <p>
            Ordering for <strong>customer #{selectedCustomerId}</strong> ·{" "}
            <button type="button" className="linkish" onClick={clearCustomer}>
              Clear selection
            </button>
          </p>
        )}

        <form onSubmit={onSubmit} aria-disabled={selectedCustomerId == null}>
          <input type="hidden" name="customer_id" value={form.customer_id} />

          <fieldset disabled={selectedCustomerId == null || submitting} style={{ border: "none", margin: 0, padding: 0 }}>
            <div className="grid">
              <label>
                Order Datetime (ISO)*
                <input
                  name="order_datetime"
                  type="text"
                  required
                  placeholder="2026-03-26T18:30:00"
                  value={form.order_datetime}
                  onChange={(e) => onInput("order_datetime", e.target.value)}
                />
              </label>

              <label>
                Billing ZIP
                <input
                  name="billing_zip"
                  type="text"
                  value={form.billing_zip}
                  onChange={(e) => onInput("billing_zip", e.target.value)}
                />
              </label>

              <label>
                Shipping ZIP
                <input
                  name="shipping_zip"
                  type="text"
                  value={form.shipping_zip}
                  onChange={(e) => onInput("shipping_zip", e.target.value)}
                />
              </label>

              <label>
                Shipping State
                <input
                  name="shipping_state"
                  type="text"
                  value={form.shipping_state}
                  onChange={(e) => onInput("shipping_state", e.target.value)}
                />
              </label>

              <label>
                Payment Method*
                <select
                  name="payment_method"
                  required
                  value={form.payment_method}
                  onChange={(e) => onInput("payment_method", e.target.value)}
                >
                  <option value="card">card</option>
                  <option value="paypal">paypal</option>
                  <option value="bank">bank</option>
                  <option value="crypto">crypto</option>
                </select>
              </label>

              <label>
                Device Type*
                <select
                  name="device_type"
                  required
                  value={form.device_type}
                  onChange={(e) => onInput("device_type", e.target.value)}
                >
                  <option value="desktop">desktop</option>
                  <option value="mobile">mobile</option>
                  <option value="tablet">tablet</option>
                </select>
              </label>

              <label>
                IP Country*
                <input
                  name="ip_country"
                  type="text"
                  required
                  value={form.ip_country}
                  onChange={(e) => onInput("ip_country", e.target.value.toUpperCase())}
                />
              </label>

              <label>
                Promo Used*
                <select
                  name="promo_used"
                  required
                  value={form.promo_used}
                  onChange={(e) => onInput("promo_used", e.target.value)}
                >
                  <option value="0">0 (No)</option>
                  <option value="1">1 (Yes)</option>
                </select>
              </label>

              <label>
                Promo Code
                <input
                  name="promo_code"
                  type="text"
                  disabled={!isPromoEnabled}
                  value={form.promo_code}
                  onChange={(e) => onInput("promo_code", e.target.value)}
                />
              </label>

              <label>
                Order Subtotal*
                <input
                  name="order_subtotal"
                  type="number"
                  required
                  step="0.01"
                  value={form.order_subtotal}
                  onChange={(e) => onInput("order_subtotal", e.target.value)}
                />
              </label>

              <label>
                Shipping Fee*
                <input
                  name="shipping_fee"
                  type="number"
                  required
                  step="0.01"
                  value={form.shipping_fee}
                  onChange={(e) => onInput("shipping_fee", e.target.value)}
                />
              </label>

              <label>
                Tax Amount*
                <input
                  name="tax_amount"
                  type="number"
                  required
                  step="0.01"
                  value={form.tax_amount}
                  onChange={(e) => onInput("tax_amount", e.target.value)}
                />
              </label>

              <label>
                Order Total*
                <input
                  name="order_total"
                  type="number"
                  required
                  step="0.01"
                  value={form.order_total}
                  onChange={(e) => onInput("order_total", e.target.value)}
                />
              </label>

              <label>
                Risk Score*
                <input
                  name="risk_score"
                  type="number"
                  required
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.risk_score}
                  onChange={(e) => onInput("risk_score", e.target.value)}
                />
              </label>

              <label>
                Is Fraud*
                <select
                  name="is_fraud"
                  required
                  value={form.is_fraud}
                  onChange={(e) => onInput("is_fraud", e.target.value)}
                >
                  <option value="0">0 (No)</option>
                  <option value="1">1 (Yes)</option>
                </select>
              </label>
            </div>

            <button type="submit" disabled={submitting || selectedCustomerId == null}>
              {submitting ? "Saving…" : "Save order"}
            </button>
          </fieldset>

          {status && (
            <div className={`status ${status.type}`} style={{ marginTop: 12 }}>
              <strong>{status.type === "ok" ? "Success:" : "Error:"}</strong> {status.message}
            </div>
          )}
        </form>
      </section>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main>
          <p>Loading…</p>
        </main>
      }
    >
      <PlaceOrderPageInner />
    </Suspense>
  );
}
