# Amazon EC2 deployment (single instance)

This guide deploys the existing app on **one** Linux EC2 instance: PySpark in local mode, Express on port 4000, nginx for HTTPS. It does **not** create AWS resources for you (those incur charges).

Replace `EXAMPLE.com`, `YOUR_IP`, `BUCKET_NAME`, and `REGION` before running commands.

## 1. EC2 instance selection

- **AMI:** Amazon Linux 2023 or Ubuntu 24.04 LTS.
- **Instance type:** `t3.large` (2 vCPU, 8 GiB) is the practical minimum because the Spark driver requests 2g and the worker caches the cleaned DataFrame. `t3.xlarge` is more comfortable. `t3.medium` (4 GiB) will likely OOM if `PREWARM_WORKER=true`.
- **Storage:** 30 GiB gp3 is enough for the OS, venv, node_modules, and the ~112k-row CSV.
- **Region:** the **same region as the S3 bucket** (avoids cross-region data-transfer charges).
- **IAM instance profile:** attach at launch (or later) — see step 6.
- **Do not** assign a public S3 bucket or disable Block Public Access.

Stop the instance when you are not using it. A running `t3.large` is billed hourly.

## 2. SSH connection

Security group: inbound **22/tcp from YOUR public IP only**. Example:

```bash
ssh -i your-key.pem ubuntu@EC2_PUBLIC_DNS   # Ubuntu
ssh -i your-key.pem ec2-user@EC2_PUBLIC_DNS # Amazon Linux
```

## 3. Software installation

On the instance:

```bash
sudo mkdir -p /opt/ecommerce-sales-analytics
sudo chown "$USER:$USER" /opt/ecommerce-sales-analytics
# copy the project here (git clone or scp -r)
cd /opt/ecommerce-sales-analytics
chmod +x deploy/ec2-setup.sh
./deploy/ec2-setup.sh
```

Confirm: `java -version`, `python3 --version`, `node --version`.

## 4. Project deployment

```bash
cd /opt/ecommerce-sales-analytics
python3 -m venv .venv
source .venv/bin/activate
pip install -r spark-engine/requirements.txt
(cd backend && npm ci --omit=dev)
(cd frontend && npm ci && npm run build)
```

If you still need a local CSV as a fallback:

```bash
python spark-engine/generate_data.py
```

## 5. Environment configuration

```bash
cp .env.example .env
nano .env
```

Minimum for S3 on EC2 (no access keys):

```
DATA_SOURCE=s3
AWS_REGION=ap-south-1
S3_BUCKET=BUCKET_NAME
S3_INPUT_KEY=raw/orders.csv
S3_OUTPUT_PREFIX=processed
S3_WRITE_RESULTS=true
S3_HYDRATE_ON_BOOT=true
CORS_ORIGIN=https://EXAMPLE.com
PREWARM_WORKER=false
JAVA_HOME=/usr/lib/jvm/java-21-amazon-corretto
PYTHON_BIN=/opt/ecommerce-sales-analytics/.venv/bin/python
```

Leave `AWS_ACCESS_KEY_ID` unset. Build the frontend **without** `VITE_API_BASE_URL` so the browser calls `/api` on the same host (nginx proxies it).

Install the systemd unit:

```bash
sudo cp deploy/ecommerce-analytics.service /etc/systemd/system/
sudo nano /etc/systemd/system/ecommerce-analytics.service   # set User= to your login
sudo systemctl daemon-reload
```

## 6. IAM role attachment

1. Create an IAM role for EC2 (`ec2.amazonaws.com` trust policy).
2. Attach a customer-managed policy based on `deploy/iam-s3-policy.json` (replace `BUCKET_NAME`). This is the persistent runtime policy: it can read `raw/*` and read/write `processed/*`, but cannot change the source dataset.
3. Attach the role to the instance (EC2 → Actions → Security → Modify IAM role).
4. Keep S3 **Block Public Access** enabled on the bucket.
5. Do not grant `s3:*` on `*`.

The runtime role intentionally cannot upload the source CSV. For initial upload, use a separate local AWS identity with `deploy/iam-s3-publisher-policy.json` (replace `BUCKET_NAME`), or attach that narrow policy temporarily to the instance role and remove it after upload. Do not leave publisher permissions on the running application role.

## 7. S3 connectivity testing

```bash
source .venv/bin/activate
python spark-engine/s3_cli.py check            # uses the persistent runtime permissions
```

If the dataset is missing, run `python spark-engine/upload_dataset.py` from a machine/profile with the separate publisher policy, then rerun `s3_cli.py check`. If uploading from EC2, temporarily attach the publisher policy and detach it immediately afterward.

`check` must report `ok: true`. If the input object is missing, upload it before running Spark.

## 8. Spark SQL execution

```bash
export DATA_SOURCE=s3 S3_BUCKET=BUCKET_NAME AWS_REGION=ap-south-1
python spark-engine/analytics.py batch
```

This reads `s3a://BUCKET_NAME/raw/orders.csv` with PySpark, runs the existing Spark SQL aggregations, writes JSON under `output/`, and copies those files to `s3://BUCKET_NAME/processed/`.

Local fallback (no AWS):

```bash
unset DATA_SOURCE
python spark-engine/analytics.py batch --input spark-engine/data/orders.csv --output output
```

## 9. Express backend startup

```bash
sudo systemctl enable --now ecommerce-analytics
sudo systemctl status ecommerce-analytics
```

Optional nginx + TLS (ports 80/443 from the internet; **do not** open 4000 publicly):

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/analytics.conf
sudo nano /etc/nginx/conf.d/analytics.conf
sudo apt-get install -y certbot python3-certbot-nginx   # Ubuntu
sudo certbot --nginx -d EXAMPLE.com
sudo nginx -t && sudo systemctl reload nginx
```

## 10. API testing

From the instance:

```bash
curl -sS http://127.0.0.1:4000/api/health
curl -sS http://127.0.0.1:4000/api/overview | head
curl -sS "http://127.0.0.1:4000/api/overview?category=Books" | head
```

From your laptop (after DNS + TLS): `https://EXAMPLE.com/api/health`.

## 11. Logging and troubleshooting

| Symptom | What to check |
|---|---|
| `JAVA_HOME is not set` | Set `JAVA_HOME` in `.env` and the systemd unit |
| `S3_BUCKET is not set` | `DATA_SOURCE=s3` requires `S3_BUCKET` |
| `No AWS credentials` | Instance profile missing or not propagated yet (wait a minute, `curl http://169.254.169.254/latest/meta-data/iam/security-credentials/`) |
| `AccessDenied` | IAM policy bucket/prefix mismatch; Block Public Access is fine and should stay on |
| `NoSuchBucket` / wrong region | `AWS_REGION` must match the bucket |
| Worker timeout on first S3 run | Maven is downloading `hadoop-aws`; set `WORKER_START_TIMEOUT_MS=300000` |
| OOM / instance freeze | Use `t3.large+`, set `PREWARM_WORKER=false`, lower `SPARK_DRIVER_MEMORY` |
| API 503 `NOT_PROCESSED` | Run the batch job; or `python spark-engine/s3_cli.py hydrate` |
| Dashboard cannot reach API | nginx `/api` proxy; `CORS_ORIGIN`; do not bake localhost into the frontend build |

Logs:

```bash
sudo journalctl -u ecommerce-analytics -f
```
