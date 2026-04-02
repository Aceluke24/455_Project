from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_ROOT = PROJECT_ROOT / "ml_pipeline"
DATA_DIR = PIPELINE_ROOT / "data"
ARTIFACTS_DIR = PIPELINE_ROOT / "artifacts"
ANALYSIS_DIR = PIPELINE_ROOT / "analysis"

# Supports both local class path and copied DB path in ml_pipeline/data.
DEFAULT_SHOP_DB = PROJECT_ROOT.parent / "Data" / "shop.db"
SHOP_DB_PATH = DATA_DIR / "shop.db" if (DATA_DIR / "shop.db").exists() else DEFAULT_SHOP_DB
WAREHOUSE_DB_PATH = DATA_DIR / "warehouse.db"

MODEL_PATH = (
  ARTIFACTS_DIR / "fraud_pipeline.joblib"
  if (ARTIFACTS_DIR / "fraud_pipeline.joblib").exists()
  else ARTIFACTS_DIR / "fraud_pipeline_model.joblib"
)
METADATA_PATH = (
  ARTIFACTS_DIR / "fraud_pipeline_metadata.json"
  if (ARTIFACTS_DIR / "fraud_pipeline_metadata.json").exists()
  else ARTIFACTS_DIR / "model_metadata.json"
)
METRICS_PATH = ARTIFACTS_DIR / "metrics.json"
FEATURE_IMPORTANCE_PATH = ANALYSIS_DIR / "feature_importance.csv"
ANALYSIS_REPORT_PATH = ANALYSIS_DIR / "analysis_report.md"

RANDOM_STATE = 42
TEST_SIZE = 0.25

ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
