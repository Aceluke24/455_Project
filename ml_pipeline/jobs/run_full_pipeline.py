from ml_pipeline.jobs.etl_build_warehouse import build_warehouse_table
from ml_pipeline.jobs.run_inference import run_inference
from ml_pipeline.jobs.train_model import train_and_serialize


def run_full_pipeline() -> None:
  warehouse_df = build_warehouse_table()
  print(f"ETL done: {len(warehouse_df)} rows")

  training_outputs = train_and_serialize()
  print(
    "Training done: accuracy={:.4f}, f1={:.4f}, roc_auc={:.4f}".format(
      training_outputs["metrics"]["accuracy"],
      training_outputs["metrics"]["f1"],
      training_outputs["metrics"]["roc_auc"],
    )
  )

  scored_count = run_inference()
  print(f"Inference done: scored {scored_count} orders")


if __name__ == "__main__":
  run_full_pipeline()
