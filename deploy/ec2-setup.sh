#!/usr/bin/env bash
# Install runtime dependencies on Amazon Linux 2023 or Ubuntu 22.04/24.04.
# Run as a sudo-capable user. Does not create AWS resources or start paid services.
#
# Java: installs Java 21 (Corretto on AL2023, OpenJDK on Ubuntu).
#       Both Java 17 and Java 21 are compatible with PySpark 4.0.x.
#       If Java 17 is already installed, the script will use it.
set -euo pipefail

if [[ ${EUID} -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

# ── Detect existing Java ────────────────────────────────────────────────────
if command -v java &>/dev/null; then
  JAVA_MAJOR=$(java -version 2>&1 | grep -oP '(?<=version ")\d+' | head -1 || echo 0)
  if [[ "$JAVA_MAJOR" -ge 17 ]]; then
    echo "==> Java ${JAVA_MAJOR} already installed — skipping Java installation"
    SKIP_JAVA=1
  else
    echo "==> Java ${JAVA_MAJOR} found but < 17; will install Java 21"
    SKIP_JAVA=0
  fi
else
  SKIP_JAVA=0
fi

echo "==> Installing Python 3, Node.js 20, nginx"

if command -v dnf &>/dev/null; then
  $SUDO dnf update -y
  if [[ "$SKIP_JAVA" -eq 0 ]]; then
    $SUDO dnf install -y java-21-amazon-corretto-devel
  fi
  $SUDO dnf install -y python3 python3-pip python3-venv git nginx
  if ! command -v node &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
    $SUDO dnf install -y nodejs
  fi
elif command -v apt-get &>/dev/null; then
  $SUDO apt-get update
  if [[ "$SKIP_JAVA" -eq 0 ]]; then
    $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y openjdk-21-jdk
  fi
  $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-venv python3-pip git nginx curl
  if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
    $SUDO apt-get install -y nodejs
  fi
else
  echo "Unsupported Linux distribution. Install Java 17 or 21, Python 3.9+, Node.js 18+, and nginx manually."
  exit 1
fi

# ── Set JAVA_HOME ───────────────────────────────────────────────────────────
if [[ -z "${JAVA_HOME:-}" ]]; then
  # Priority: Corretto 21 → OpenJDK 21 → Corretto 17 → OpenJDK 17
  for candidate in \
    /usr/lib/jvm/java-21-amazon-corretto \
    /usr/lib/jvm/java-21-openjdk-amd64 \
    /usr/lib/jvm/java-21-openjdk-arm64 \
    /usr/lib/jvm/java-21 \
    /usr/lib/jvm/java-17-amazon-corretto \
    /usr/lib/jvm/java-17-openjdk-amd64 \
    /usr/lib/jvm/java-17-openjdk-arm64 \
    /usr/lib/jvm/java-17 \
    /usr/lib/jvm/temurin-17 \
    /usr/lib/jvm/temurin-21; do
    if [[ -d "$candidate" ]]; then
      echo "export JAVA_HOME=${candidate}" | $SUDO tee /etc/profile.d/java.sh > /dev/null
      echo "==> JAVA_HOME set to ${candidate}"
      break
    fi
  done
fi

# ── Verify versions ─────────────────────────────────────────────────────────
echo ""
echo "==> Versions installed:"
java -version 2>&1 || echo "  java: NOT FOUND"
python3 --version  || echo "  python3: NOT FOUND"
node --version     || echo "  node: NOT FOUND"
npm --version      || echo "  npm: NOT FOUND"

echo ""
echo "==> Next steps:"
echo "  1. Copy project to /opt/ecommerce-sales-analytics"
echo "  2. cd /opt/ecommerce-sales-analytics"
echo "  3. python3 -m venv .venv && .venv/bin/pip install -r spark-engine/requirements.txt"
echo "  4. cd backend && npm ci --omit=dev && cd .."
echo "  5. cd frontend && npm ci && npm run build && cd .."
echo "  6. cp .env.example .env && nano .env   # set S3_BUCKET, AWS_REGION, etc."
echo "  7. Attach IAM instance profile (EC2 → Actions → Security → Modify IAM role)"
echo "  8. bash deploy/verify-ec2.sh           # pre-flight health check"
echo "  9. sudo cp deploy/ecommerce-analytics.service /etc/systemd/system/"
echo " 10. sudo systemctl enable --now ecommerce-analytics"
echo ""
echo "For full setup instructions: cat deploy/README.md"
