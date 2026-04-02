"""
Run inference using the latest fraud pipeline artifact.
"""

from datetime import datetime, timezone
import json
import sqlite3
from typing import List, Tuple

import joblib
import numpy as np
import pandas as pd

from ml_pipeline.jobs.config import METADATA_PATH, MODEL_PATH, SHOP_DB_PATH
from ml_pipeline.jobs.utils_db import sqlite_conn


def _read_table_or_empty(conn: sqlite3.Connection, table: str, columns: List[str]) -> pd.DataFrame:
  try:
    return pd.read_sql_query(f"SELECT * FROM {table}", conn)
  except Exception:
    return pd.DataFrame(columns=columns)


def _build_order_level_features(conn: sqlite3.Connection) -> Tuple[pd.DataFrame, List[int]]:
  orders = _read_table_or_empty(
    conn,
    "orders",
    [
      "order_id",
      "customer_id",
      "order_datetime",
      "billing_zip",
      "shipping_zip",
      "shipping_state",
      "payment_method",
      "device_type",
      "ip_country",
      "promo_used",
      "order_subtotal",
      "shipping_fee",
      "tax_amount",
      "order_total",
    ],
  )
  customers = _read_table_or_empty(
    conn,
    "customers",
    [
      "customer_id",
      "gender",
      "city",
      "state",
      "zip_code",
      "customer_segment",
      "loyalty_tier",
      "is_active",
      "created_at",
      "birthdate",
    ],
  )
  order_items = _read_table_or_empty(
    conn,
    "order_items",
    ["order_item_id", "order_id", "product_id", "quantity", "unit_price", "line_total"],
  )
  products = _read_table_or_empty(conn, "products", ["product_id", "category", "price", "cost"])
  shipments = _read_table_or_empty(
    conn,
    "shipments",
    ["order_id", "carrier", "shipping_method", "distance_band", "promised_days", "actual_days", "late_delivery"],
  )

  orders["order_datetime"] = pd.to_datetime(orders.get("order_datetime"), errors="coerce")
  customers["created_at"] = pd.to_datetime(customers.get("created_at"), errors="coerce")
  customers["birthdate"] = pd.to_datetime(customers.get("birthdate"), errors="coerce")

  item_agg = (
    order_items.merge(products[["product_id", "category", "price", "cost"]], on="product_id", how="left")
    .groupby("order_id", as_index=False)
    .agg(
      item_count=("order_item_id", "count"),
      total_quantity=("quantity", "sum"),
      unique_products=("product_id", "nunique"),
      unique_categories=("category", "nunique"),
      mean_unit_price=("unit_price", "mean"),
      sum_line_total=("line_total", "sum"),
    )
  )

  margin_df = order_items.merge(products[["product_id", "price", "cost"]], on="product_id", how="left")
  margin_df["margin"] = margin_df["price"] - margin_df["cost"]
  margin_agg = margin_df.groupby("order_id", as_index=False).agg(
    avg_item_margin=("margin", "mean"),
    total_item_margin=("margin", "sum"),
  )

  ship_agg = shipments.groupby("order_id", as_index=False).agg(
    carrier=("carrier", "first"),
    shipping_method=("shipping_method", "first"),
    distance_band=("distance_band", "first"),
    promised_days=("promised_days", "mean"),
    actual_days=("actual_days", "mean"),
    late_delivery=("late_delivery", "max"),
  )

  df = (
    orders.merge(customers, on="customer_id", how="left")
    .merge(item_agg, on="order_id", how="left")
    .merge(margin_agg, on="order_id", how="left")
    .merge(ship_agg, on="order_id", how="left")
  )

  df["order_hour"] = df["order_datetime"].dt.hour
  df["order_dayofweek"] = df["order_datetime"].dt.dayofweek
  df["order_month"] = df["order_datetime"].dt.month
  df["is_weekend_order"] = df["order_dayofweek"].isin([5, 6]).astype(int)
  df["customer_tenure_days"] = (df["order_datetime"] - df["created_at"]).dt.days
  df["customer_age_years"] = ((df["order_datetime"] - df["birthdate"]).dt.days / 365.25).round(1)
  df["zip_mismatch"] = (df["billing_zip"].fillna("UNK") != df["shipping_zip"].fillna("UNK")).astype(int)
  df["ip_domestic_us"] = df["ip_country"].fillna("UNK").astype(str).str.upper().eq("US").astype(int)
  df["state_matches_customer"] = (
    df["shipping_state"].fillna("UNK").astype(str).str.upper()
    == df["state"].fillna("UNK").astype(str).str.upper()
  ).astype(int)
  df["total_to_subtotal_ratio"] = df["order_total"] / df["order_subtotal"].replace(0, np.nan)
  df["avg_item_value"] = df["sum_line_total"] / df["item_count"].replace(0, np.nan)
  df = df.sort_values(["customer_id", "order_datetime"], na_position="last")
  df["prior_order_count"] = df.groupby("customer_id").cumcount()
  df["first_order_flag"] = (df["prior_order_count"] == 0).astype(int)

  order_ids = df["order_id"].fillna(0).astype(int).tolist()
  return df, order_ids


def run_inference() -> int:
  if not MODEL_PATH.exists():
    raise FileNotFoundError(
      f"Pipeline artifact not found at {MODEL_PATH}. Train/export the fraud pipeline before running inference."
    )

  model = joblib.load(MODEL_PATH)
  metadata = {}
  if METADATA_PATH.exists():
    with open(METADATA_PATH, "r", encoding="utf-8") as metadata_file:
      metadata = json.load(metadata_file)

  model_version = metadata.get("created_at_utc") or metadata.get("model_version")
  raw_columns = metadata.get("raw_feature_columns", [])

  with sqlite_conn(SHOP_DB_PATH) as conn:
    feature_df, order_ids = _build_order_level_features(conn)

    if raw_columns:
      for column in raw_columns:
        if column not in feature_df.columns:
          feature_df[column] = np.nan
      x_live = feature_df[raw_columns].replace([np.inf, -np.inf], np.nan)
    else:
      x_live = feature_df.drop(columns=["order_id"], errors="ignore").replace([np.inf, -np.inf], np.nan)

    probs = model.predict_proba(x_live)[:, 1]
    preds = model.predict(x_live)

    cursor = conn.cursor()
    cursor.execute(
      """
      CREATE TABLE IF NOT EXISTS order_fraud_predictions (
        order_id INTEGER PRIMARY KEY,
        fraud_probability REAL NOT NULL,
        predicted_is_fraud INTEGER NOT NULL,
        model_name TEXT NOT NULL,
        model_version TEXT,
        prediction_timestamp TEXT NOT NULL
      )
      """
    )

    timestamp = datetime.now(timezone.utc).isoformat()
    rows = [
      (
        int(order_id),
        float(prob),
        int(pred),
        "fraud_pipeline_ml",
        model_version,
        timestamp,
      )
      for order_id, prob, pred in zip(order_ids, probs, preds)
    ]

    cursor.executemany(
      """
      INSERT INTO order_fraud_predictions (
        order_id, fraud_probability, predicted_is_fraud, model_name, model_version, prediction_timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET
        fraud_probability=excluded.fraud_probability,
        predicted_is_fraud=excluded.predicted_is_fraud,
        model_name=excluded.model_name,
        model_version=excluded.model_version,
        prediction_timestamp=excluded.prediction_timestamp
      """,
      rows,
    )
    conn.commit()

  return len(rows)


if __name__ == "__main__":
  total_scored = run_inference()
  print(f"scored orders: {total_scored}")
