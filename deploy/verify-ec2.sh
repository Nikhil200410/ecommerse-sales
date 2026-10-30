#!/usr/bin/env bash
# verify-ec2.sh — Quick health check to run on an EC2 instance before starting the service.
# Usage: bash deploy/verify-ec2.sh
# Run from the project root (/opt/ecommerce-sales-analytics or wherever you deployed).
set -euo pipefail

PASS=0; FAIL=0; WARN=0

ok()   { echo "  [PASS] $1"; ((PASS++));  }
fail() { echo "  [FAIL] $1"; ((FAIL++));  }
warn() { echo "  [WARN] $1"; ((WARN++));  }
sep()  { echo ""; echo "=== $1 ==="; }

sep "1. Java"
if command -v java &>/dev/null; then
  JAVA_VER=$(java -version 2>&1 | head -1)
  ok "java found: $JAVA_VER"
  MAJOR=$(java -version 2>&1 | grep -oP '(?<=version ")\d+' | head -1)
  if [[ "$MAJOR" -ge 17 ]]; then
    ok "Java >= 17 (PySpark 4.x compatible)"
  else
    fail "Java < 17. PySpark 4.0.x requires Java 17 or 21."
  fi
  if [[ -n "${JAVA_HOME:-}" ]]; then
    ok "JAVA_HOME=${JAVA_HOME}"
  else
    warn "JAVA_HOME is not set. Set it in .env or /etc/profile.d/ to ensure Spark finds the JDK."
  fi
else
  fail "java not found. Run: sudo dnf install -y java-21-amazon-corretto-devel"
fi

sep "2. Python and venv"
PYTHON_BIN="${PYTHON_BIN:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  VENV_PY="$(pwd)/.venv/bin/python"
  [[ -f "$VENV_PY" ]] && PYTHON_BIN="$VENV_PY" || PYTHON_BIN="python3"
fi

if command -v "$PYTHON_BIN" &>/dev/null; then
  PY_VER=$("$PYTHON_BIN" --version)
  ok "$PYTHON_BIN: $PY_VER"
else
  fail "Python not found at $PYTHON_BIN. Create the venv: python3 -m venv .venv && .venv/bin/pip install -r spark-engine/requirements.txt"
fi

if "$PYTHON_BIN" -c "import pyspark; print('  PySpark', pyspark.__version__)" 2>/dev/null; then
  ok "pyspark importable"
else
  fail "pyspark not importable. Run: $PYTHON_BIN -m pip install -r spark-engine/requirements.txt"
fi

if "$PYTHON_BIN" -c "import boto3; print('  boto3', boto3.__version__)" 2>/dev/null; then
  ok "boto3 importable"
else
  fail "boto3 not importable. Run: $PYTHON_BIN -m pip install boto3"
fi

sep "3. Node.js"
if command -v node &>/dev/null; then
  ok "node $(node --version)"
else
  fail "node not found."
fi
if [[ -f backend/node_modules/.package-lock.json || -d backend/node_modules/express ]]; then
  ok "backend/node_modules present"
else
  fail "backend/node_modules missing. Run: cd backend && npm ci --omit=dev"
fi

sep "4. Environment file"
if [[ -f .env ]]; then
  ok ".env exists"
  if grep -qE '^DATA_SOURCE=' .env; then ok "DATA_SOURCE configured"; else warn "DATA_SOURCE not set in .env (defaults to local)"; fi
  if grep -qE '^S3_BUCKET=.+' .env; then
    ok "S3_BUCKET set"
    DS=$(grep -E '^DATA_SOURCE=' .env | cut -d= -f2- | tr -d '[:space:]' || true)
    [[ "$DS" == "s3" ]] && ok "DATA_SOURCE=s3" || warn "S3_BUCKET is set but DATA_SOURCE is not 's3'"
  else
    warn "S3_BUCKET not set (ok for local mode)"
  fi
else
  fail ".env not found. Run: cp .env.example .env && nano .env"
fi

sep "5. Dataset and output"
if [[ -f spark-engine/data/orders.csv ]]; then
  ROWS=$(wc -l < spark-engine/data/orders.csv)
  ok "spark-engine/data/orders.csv exists ($ROWS lines)"
else
  warn "orders.csv missing. Either: python spark-engine/generate_data.py  OR  python spark-engine/upload_dataset.py (for S3 mode)"
fi
if [[ -f output/analytics.json ]]; then
  ok "output/analytics.json exists — Spark has been run"
else
  warn "output/analytics.json missing. Run the Spark job: python spark-engine/analytics.py batch"
fi

sep "6. S3 connectivity (skipped if S3_BUCKET not set)"
if [[ -f .env ]]; then source <(grep -E '^(S3_BUCKET|AWS_REGION|DATA_SOURCE)=' .env | sed 's/^/export /'); fi
if [[ -n "${S3_BUCKET:-}" ]]; then
  echo "  Checking s3://$S3_BUCKET (region=${AWS_REGION:-ap-south-1}) ..."
  if "$PYTHON_BIN" spark-engine/s3_cli.py check; then
    ok "S3 bucket reachable and credentials valid"
  else
    fail "S3 check failed — see output above"
  fi
else
  warn "S3_BUCKET not set — skipping S3 connectivity check"
fi

sep "7. IAM instance profile (EC2 only)"
if curl -sf --connect-timeout 2 http://169.254.169.254/latest/meta-data/iam/security-credentials/ &>/dev/null; then
  ROLE=$(curl -sf --connect-timeout 2 http://169.254.169.254/latest/meta-data/iam/security-credentials/ || true)
  ok "Instance profile attached: $ROLE"
else
  warn "Not running on EC2 or no instance profile — AWS access will use env/profile credentials"
fi

sep "8. Ports"
if command -v ss &>/dev/null; then
  if ss -tlnp 2>/dev/null | grep -q ':4000'; then
    ok "Port 4000 listening (Express API already running)"
  else
    ok "Port 4000 not yet in use (API not started)"
  fi
fi

sep "Summary"
echo "  Passed: $PASS  |  Warnings: $WARN  |  Failed: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "Fix all [FAIL] items before starting the service."
  exit 1
else
  echo ""
  echo "All checks passed. You can start the service:"
  echo "  sudo systemctl enable --now ecommerce-analytics"
  echo "  # then test: curl -sS http://127.0.0.1:4000/api/health"
fi
