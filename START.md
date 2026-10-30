# Start instructions (copy-paste)

Requirements: **Java 17 or 21**, **Python 3.9+**, **Node.js 18+** (tested: Java 21, Python 3.13, Node 22).
Check: `java -version`, `python3 --version`, `node --version`.

## One-time setup (from the project root)

**macOS / Linux**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r spark-engine/requirements.txt
python spark-engine/generate_data.py          # creates spark-engine/data/orders.csv (~112k rows)
(cd backend  && npm install)
(cd frontend && npm install)
```

**Windows (PowerShell)**
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r spark-engine\requirements.txt
python spark-engine\generate_data.py
cd backend;  npm install; cd ..
cd frontend; npm install; cd ..
```

## Run the Spark job (about 1 minute)
```bash
python spark-engine/analytics.py batch        # writes output/*.json
```
(You can also skip this and click **Run Spark job** in the dashboard.)

## Start the app (two terminals)
```bash
# terminal 1 - API on http://localhost:4000
cd backend && npm start

# terminal 2 - dashboard on http://localhost:5173
cd frontend && npm run dev
```
Open **http://localhost:5173**.

## Optional: Amazon S3 (Linux/EC2; bucket must already exist and stay private)

```bash
cp .env.example .env          # set S3_BUCKET and AWS_REGION; do not commit .env
python spark-engine/upload_dataset.py
python spark-engine/s3_cli.py check
DATA_SOURCE=s3 python spark-engine/analytics.py batch
```

On Windows PowerShell (local CSV remains the default):

```powershell
Copy-Item .env.example .env
$env:DATA_SOURCE='local'
python spark-engine\analytics.py batch
```

EC2 install, IAM, HTTPS: see **deploy/README.md**. This project will not create paid AWS resources unless you do that in the AWS console.

## Run the tests
```bash
python -m pytest spark-engine/tests -q        # Spark logic vs. hand-calculated values (~1 min)
cd backend && npm test                        # real Spark job + API + CSV export (~2 min)
cd frontend && npm run build                  # frontend compiles
```
