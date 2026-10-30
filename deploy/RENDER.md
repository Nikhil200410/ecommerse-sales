# Deploy the full app with Render and Vercel

This setup runs the React dashboard on Vercel and the long-running Express + PySpark API on Render. The repository-root `Dockerfile` installs Java, Python/PySpark, and Node.js, and creates the synthetic dataset in the image.

## 1. Deploy the API on Render

1. Sign in to [Render](https://render.com/) with GitHub and create a **New + → Web Service**.
2. Connect `Nikhil200410/ecommerse-sales` and select the `main` branch.
3. Configure the service:
   - **Language / Runtime:** Docker
   - **Root Directory:** leave blank (repository root)
   - **Dockerfile Path:** `./Dockerfile`
   - **Health Check Path:** `/api/health`
   - **Instance type:** choose a paid instance with at least 8 GB RAM for the Spark driver and worker. The free instance is not suitable for this workload.
4. Create the service and wait for the Docker image to build. Copy the service's HTTPS URL, for example `https://ecommerce-analytics-api.onrender.com`.

The API starts with a generated synthetic dataset but no processed reports. Once the frontend is deployed, use its **Run Spark job** button to create the reports. Processing can take about a minute.

## 2. Deploy the dashboard on Vercel

1. Import the same GitHub repository into [Vercel](https://vercel.com/).
2. Set **Root Directory** to `frontend` and the framework preset to **Vite**. The build command should be `npm run build`, and the output directory should be `dist`.
3. Add this environment variable, using the Render URL from step 1 (no trailing slash and no `/api`):

   ```text
   VITE_API_BASE_URL=https://ecommerce-analytics-api.onrender.com
   ```

4. Deploy the project and copy its public URL, for example `https://ecommerse-sales.vercel.app`.

## 3. Allow the Vercel site to call the API

In the Render service's **Environment** settings, add:

```text
CORS_ORIGIN=https://ecommerse-sales.vercel.app
```

Use the exact origin Vercel assigned to your deployment. If you also use a custom domain, list both origins separated by a comma. Save the setting and let Render redeploy/restart the API.

If you change `VITE_API_BASE_URL`, redeploy the Vercel frontend so the new URL is included in its build.

## Notes

- Spark needs substantial memory; a free or low-memory service may be terminated while processing or answering filtered queries.
- Render's local filesystem is ephemeral unless you attach a persistent disk. Without one, reports in `/app/output` may disappear after a restart or redeploy; click **Run Spark job** again to regenerate them. A Render disk mounted at `/app/output` can preserve reports.
- The generated dataset is fictional and bundled into the Docker image. To use your own CSV or Amazon S3, configure the corresponding API environment variables in Render; never commit AWS credentials.
