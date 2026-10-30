# Free static dashboard on Vercel

This deployment does not run an API or Spark in the cloud. Generate the Spark reports on your own computer, publish them with the frontend, and host the resulting static site on Vercel's free Hobby plan, subject to Vercel's current plan limits.

## 1. Generate a local snapshot

Requirements: Java 17 or 21, Python 3.9+, and Node.js 18+.

From the project root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r spark-engine\requirements.txt
cd backend
npm ci
cd ..
cd frontend
npm ci
cd ..
python spark-engine\generate_data.py
$env:DATA_SOURCE = 'local'
$env:SPARK_ENABLE_S3 = 'false'
$env:S3_WRITE_RESULTS = 'false'
python spark-engine\analytics.py batch --input spark-engine\data\orders.csv --output output
node backend\scripts\createStaticSnapshot.js
```

The Spark step runs locally and writes the generated dashboard snapshot to `frontend/public/data`. The checked-in `.env` is ignored, and the explicit environment overrides keep this workflow on local data and prevent report uploads to S3.

## 2. Publish the snapshot to GitHub

```powershell
git add frontend\public\data frontend\src\App.jsx frontend\src\services\api.js frontend\src\pages\DataQualityPage.jsx backend\scripts\createStaticSnapshot.js deploy\STATIC-VERCEL.md README.md
git commit -m "Add free static dashboard deployment" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push
```

## 3. Deploy the frontend on Vercel

1. Import the GitHub repository into Vercel.
2. Set **Root Directory** to `frontend`, **Framework Preset** to **Vite**, **Build Command** to `npm run build`, and **Output Directory** to `dist`.
3. Do not set `VITE_API_BASE_URL`; the static dashboard loads its JSON and CSV files from the same Vercel site.
4. Deploy. Every later push to `main` triggers a new deployment.

## Limitations

- The dashboard is a precomputed, unfiltered snapshot. The cloud site cannot launch Spark jobs or calculate filtered queries.
- To refresh it, run the local Spark and snapshot commands again, then commit and push the updated `frontend/public/data` files.
- The Render service is not needed for this static deployment. Suspend or delete it in Render if you do not want it running; check Render's dashboard for any billing status.
