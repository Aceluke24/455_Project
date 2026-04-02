"""
Simple analysis pipeline aligned to Chapter 17:
- Read metrics + metadata artifacts
- Produce a human-readable markdown report
"""

import json
from pathlib import Path

from ml_pipeline.jobs.config import ANALYSIS_REPORT_PATH, METADATA_PATH, METRICS_PATH


def build_report() -> Path:
  with open(METADATA_PATH, "r", encoding="utf-8") as metadata_file:
    metadata = json.load(metadata_file)

  with open(METRICS_PATH, "r", encoding="utf-8") as metrics_file:
    metrics = json.load(metrics_file)

  classes = metrics.get("classification_report", {})
  class_rows = []
  for label, values in classes.items():
    if isinstance(values, dict) and {"precision", "recall", "f1-score", "support"} <= values.keys():
      class_rows.append(
        {
          "label": label,
          "precision": values["precision"],
          "recall": values["recall"],
          "f1-score": values["f1-score"],
          "support": values["support"],
        }
      )
  lines = [
    "# Fraud Model Analysis Report",
    "",
    "## Model metadata",
    f"- Model name: `{metadata.get('model_name')}`",
    f"- Version: `{metadata.get('model_version')}`",
    f"- Trained at (UTC): `{metadata.get('trained_at_utc')}`",
    f"- Training rows: `{metadata.get('num_training_rows')}`",
    f"- Test rows: `{metadata.get('num_test_rows')}`",
    f"- Feature count: `{len(metadata.get('features', []))}`",
    f"- Reviewed labels used: `{metadata.get('reviewed_labels_used', False)}`",
    f"- Reviewed label count: `{metadata.get('reviewed_label_count', 0)}`",
    "",
    "## Core predictive metrics",
    f"- Accuracy: `{metrics.get('accuracy', 0):.4f}`",
    f"- F1: `{metrics.get('f1', 0):.4f}`",
    f"- Precision: `{metrics.get('precision', 0):.4f}`",
    f"- Recall: `{metrics.get('recall', 0):.4f}`",
    f"- ROC AUC: `{metrics.get('roc_auc', 0):.4f}`",
    "",
    "## Classification report (per class)",
    "",
  ]

  if not class_rows:
    lines.append("No classification report details found.")
  else:
    lines.append("| label | precision | recall | f1-score | support |")
    lines.append("| --- | ---: | ---: | ---: | ---: |")
    for row in class_rows:
      lines.append(
        f"| {row['label']} | {row['precision']:.4f} | {row['recall']:.4f} | "
        f"{row['f1-score']:.4f} | {row['support']:.0f} |"
      )

  ANALYSIS_REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
  return ANALYSIS_REPORT_PATH


if __name__ == "__main__":
  report_path = build_report()
  print(f"analysis report written: {report_path}")
