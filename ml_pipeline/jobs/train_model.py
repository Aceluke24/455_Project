"""
Chapter 17 style training job:
- Load denormalized warehouse table
- Train sklearn pipeline
- Evaluate + serialize model artifact
- Save metadata and metrics JSON
"""

import json
from datetime import datetime, timezone

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
  accuracy_score,
  classification_report,
  f1_score,
  precision_score,
  recall_score,
  roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from ml_pipeline.jobs.config import (
  METADATA_PATH,
  METRICS_PATH,
  MODEL_PATH,
  RANDOM_STATE,
  TEST_SIZE,
  WAREHOUSE_DB_PATH,
)
from ml_pipeline.jobs.utils_db import sqlite_conn


def train_and_serialize() -> dict:
  with sqlite_conn(WAREHOUSE_DB_PATH) as conn:
    df = pd.read_sql_query("SELECT * FROM fact_orders_ml", conn)

  if "label_is_fraud" not in df.columns:
    raise ValueError("Expected target column 'label_is_fraud' in fact_orders_ml.")

  label_col = "label_is_fraud"
  y = df[label_col].astype(int)
  X = df.drop(columns=[label_col, "order_id", "is_fraud"])

  categorical_cols = [
    c
    for c in X.columns
    if X[c].dtype == "object" or str(X[c].dtype).startswith("category")
  ]
  numeric_cols = [c for c in X.columns if c not in categorical_cols]

  preprocessor = ColumnTransformer(
    transformers=[
      (
        "num",
        Pipeline(
          steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
          ]
        ),
        numeric_cols,
      ),
      (
        "cat",
        Pipeline(
          steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
          ]
        ),
        categorical_cols,
      ),
    ]
  )

  pipeline = Pipeline(
    steps=[
      ("prep", preprocessor),
      (
        "model",
        LogisticRegression(
          max_iter=2000,
          random_state=RANDOM_STATE,
          class_weight="balanced",
        ),
      ),
    ]
  )

  X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=TEST_SIZE,
    random_state=RANDOM_STATE,
    stratify=y,
  )

  pipeline.fit(X_train, y_train)

  y_pred = pipeline.predict(X_test)
  y_prob = pipeline.predict_proba(X_test)[:, 1]

  metrics = {
    "accuracy": float(accuracy_score(y_test, y_pred)),
    "f1": float(f1_score(y_test, y_pred, zero_division=0)),
    "precision": float(precision_score(y_test, y_pred, zero_division=0)),
    "recall": float(recall_score(y_test, y_pred, zero_division=0)),
    "roc_auc": float(roc_auc_score(y_test, y_prob)),
    "classification_report": classification_report(y_test, y_pred, output_dict=True, zero_division=0),
  }

  metadata = {
    "model_name": "fraud_pipeline",
    "model_version": datetime.now(timezone.utc).strftime("%Y.%m.%d.%H%M"),
    "trained_at_utc": datetime.now(timezone.utc).isoformat(),
    "warehouse_table": "fact_orders_ml",
    "num_training_rows": int(X_train.shape[0]),
    "num_test_rows": int(X_test.shape[0]),
    "features": list(X.columns),
    "label": label_col,
    "reviewed_labels_used": bool((df["label_is_fraud"] != df["is_fraud"]).any()),
    "reviewed_label_count": int((df["label_is_fraud"] != df["is_fraud"]).sum()),
    "algorithm": "LogisticRegression",
  }

  joblib.dump(pipeline, MODEL_PATH)

  with open(METADATA_PATH, "w", encoding="utf-8") as metadata_file:
    json.dump(metadata, metadata_file, indent=2)

  with open(METRICS_PATH, "w", encoding="utf-8") as metrics_file:
    json.dump(metrics, metrics_file, indent=2)

  return {"metadata": metadata, "metrics": metrics}


if __name__ == "__main__":
  outputs = train_and_serialize()
  print(f"saved model: {MODEL_PATH}")
  print(
    "accuracy={:.4f} f1={:.4f} roc_auc={:.4f}".format(
      outputs["metrics"]["accuracy"],
      outputs["metrics"]["f1"],
      outputs["metrics"]["roc_auc"],
    )
  )
