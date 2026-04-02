"""
Chapter 17 style ETL job:
1) Extract from operational DB (shop.db)
2) Transform to denormalized ML table
3) Load into warehouse.db as fact_orders_ml
"""

import pandas as pd

from ml_pipeline.jobs.config import SHOP_DB_PATH, WAREHOUSE_DB_PATH
from ml_pipeline.jobs.utils_db import sqlite_conn


def table_exists(conn, table_name: str) -> bool:
    result = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    ).fetchone()
    return result is not None


def build_warehouse_table() -> pd.DataFrame:
    with sqlite_conn(SHOP_DB_PATH) as conn:
        if table_exists(conn, "fraud_feedback"):
            query = """
            SELECT
              o.order_id,
              o.customer_id,
              o.order_datetime,
              o.payment_method,
              o.device_type,
              o.ip_country,
              o.promo_used,
              o.order_subtotal,
              o.shipping_fee,
              o.tax_amount,
              o.order_total,
              o.risk_score,
              o.is_fraud,
              CAST(COALESCE(ff.actual_is_fraud, o.is_fraud) AS INTEGER) AS label_is_fraud,
              c.gender,
              c.birthdate,
              c.customer_segment,
              c.loyalty_tier,
              c.is_active,
              CAST(COALESCE(oi.num_items, 0) AS REAL) AS num_items,
              CAST(COALESCE(oi.avg_item_qty, 0) AS REAL) AS avg_item_qty,
              CAST(COALESCE(oi.avg_unit_price, 0) AS REAL) AS avg_unit_price
            FROM orders o
            JOIN customers c ON c.customer_id = o.customer_id
            LEFT JOIN (
              SELECT
                order_id,
                COUNT(*) AS num_items,
                AVG(quantity) AS avg_item_qty,
                AVG(unit_price) AS avg_unit_price
              FROM order_items
              GROUP BY order_id
            ) oi ON oi.order_id = o.order_id
            LEFT JOIN fraud_feedback ff ON ff.order_id = o.order_id
            """
        else:
            query = """
            SELECT
              o.order_id,
              o.customer_id,
              o.order_datetime,
              o.payment_method,
              o.device_type,
              o.ip_country,
              o.promo_used,
              o.order_subtotal,
              o.shipping_fee,
              o.tax_amount,
              o.order_total,
              o.risk_score,
              o.is_fraud,
              o.is_fraud AS label_is_fraud,
              c.gender,
              c.birthdate,
              c.customer_segment,
              c.loyalty_tier,
              c.is_active,
              CAST(COALESCE(oi.num_items, 0) AS REAL) AS num_items,
              CAST(COALESCE(oi.avg_item_qty, 0) AS REAL) AS avg_item_qty,
              CAST(COALESCE(oi.avg_unit_price, 0) AS REAL) AS avg_unit_price
            FROM orders o
            JOIN customers c ON c.customer_id = o.customer_id
            LEFT JOIN (
              SELECT
                order_id,
                COUNT(*) AS num_items,
                AVG(quantity) AS avg_item_qty,
                AVG(unit_price) AS avg_unit_price
              FROM order_items
              GROUP BY order_id
            ) oi ON oi.order_id = o.order_id
            """

        df = pd.read_sql_query(query, conn)

    # Consistent datetime engineering in ETL (not in training).
    df["order_datetime"] = pd.to_datetime(df["order_datetime"], errors="coerce")
    df["birthdate"] = pd.to_datetime(df["birthdate"], errors="coerce")
    customer_age = (df["order_datetime"] - df["birthdate"]).dt.days / 365.25
    df["customer_age_at_order"] = customer_age.fillna(customer_age.median())
    df["order_hour"] = df["order_datetime"].dt.hour.fillna(0).astype(int)
    df["order_dayofweek"] = df["order_datetime"].dt.dayofweek.fillna(0).astype(int)
    df["order_month"] = df["order_datetime"].dt.month.fillna(1).astype(int)

    # Drop raw date fields after deriving reusable ML features.
    df = df.drop(columns=["order_datetime", "birthdate"])

    with sqlite_conn(WAREHOUSE_DB_PATH) as warehouse_conn:
        df.to_sql("fact_orders_ml", warehouse_conn, if_exists="replace", index=False)

    return df


if __name__ == "__main__":
    warehouse_df = build_warehouse_table()
    print(f"warehouse ready: {WAREHOUSE_DB_PATH}")
    print(f"rows={len(warehouse_df)} cols={len(warehouse_df.columns)}")
