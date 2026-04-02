# Chapter 17 ML Pipelines (Analysis + Prediction)

This folder implements the Chapter 17 deployment pattern using your `shop.db`:

- ETL job builds an analytical warehouse table
- Training job creates a serialized model artifact + metadata + metrics
- Inference job scores orders and writes predictions back to the operational DB
- Analysis job generates a markdown report from saved metrics
- ETL/training prioritize reviewed fraud labels from `fraud_feedback` when available

## Project structure

```text
ml_pipeline/
  data/
    warehouse.db
    # optional: shop.db copy (if not present, uses ../Data/shop.db)
  artifacts/
    fraud_pipeline_model.joblib
    model_metadata.json
    metrics.json
  analysis/
    analyze_model.py
    analysis_report.md
  jobs/
    config.py
    utils_db.py
    etl_build_warehouse.py
    train_model.py
    run_inference.py
    run_full_pipeline.py
```

## 1) Install Python dependencies

From `basic-order-app`:

```bash
python3 -m pip install -r ml_pipeline/requirements.txt
```

## 2) Run full pipeline (ETL -> train -> inference)

```bash
python3 -m ml_pipeline.jobs.run_full_pipeline
```

This writes:

- analytical table `fact_orders_ml` in `ml_pipeline/data/warehouse.db`
- model artifacts in `ml_pipeline/artifacts/`
- predictions table `order_fraud_predictions` back into `shop.db`

## 3) Run analysis report

```bash
python3 -m ml_pipeline.analysis.analyze_model
```

Report output:

- `ml_pipeline/analysis/analysis_report.md`

## 4) Run each job separately

```bash
python3 -m ml_pipeline.jobs.etl_build_warehouse
python3 -m ml_pipeline.jobs.train_model
python3 -m ml_pipeline.jobs.run_inference
```

## 5) Scheduled jobs (example cron)

Nightly run at 2:30 AM:

```cron
30 2 * * * cd /Users/luke/IS455MachineLearning/basic-order-app && /usr/bin/python3 -m ml_pipeline.jobs.run_full_pipeline >> ml_pipeline/analysis/pipeline.log 2>&1
```

## Outputs in operational DB

Inference writes to `order_fraud_predictions`:

- `order_id` (PK)
- `fraud_probability`
- `predicted_is_fraud`
- `model_name`
- `model_version`
- `prediction_timestamp`

When a `fraud_feedback` table exists with `actual_is_fraud`, ETL uses:
- `label_is_fraud = COALESCE(fraud_feedback.actual_is_fraud, orders.is_fraud)`

This allows admin-reviewed labels to feed future retraining runs.
