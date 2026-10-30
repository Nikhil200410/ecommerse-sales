# Project Report Outline — E-Commerce Sales Analytics Using Apache Spark

**1. Abstract** (150–200 words) — Summarise the problem (large order datasets are hard to analyse with spreadsheets), the solution (PySpark ETL + Spark SQL analytics, Express API, React dashboard), the dataset (synthetic, 112k rows with injected defects) and the outcome (a working dashboard whose numbers are verified against hand-calculated values on a small test file). Do not quote performance figures you did not measure.

**2. Problem Statement** — Retail data arrives with duplicates, invalid values and inconsistent formats; managers need trustworthy revenue, product, customer, region and payment insights, filtered by period and category, without manual spreadsheet work.

**3. Objectives** — (a) clean and validate raw order data with Spark; (b) compute revenue, order, product, customer, geographic and payment analytics with Spark SQL; (c) expose results via REST APIs; (d) present an interactive, responsive dashboard; (e) verify calculations with a small hand-checked dataset.

**4. Existing vs Proposed System**
* Existing: Excel/CSV analysis; single-machine, manual cleaning, hard to repeat, slows down with size, errors go unnoticed.
* Proposed: automated, repeatable Spark pipeline with explicit data-quality rules and report; analytics served through an API; interactive dashboard. Scales from a laptop (local mode) to a cluster without changing the analytics code.

**5. System Architecture** — CSV → PySpark cleaning → DataFrames/Spark SQL → precomputed JSON (+ long-lived Spark worker for filtered queries) → Express REST API → React/Recharts. Include the diagram from the README and a short note on why Node talks to Python through a controlled subprocess (argument array, JSON-lines).

**6. Methodology**
* Data: schema, synthetic generation (seed, injected defects).
* ETL rules: trimming, de-duplication, six validation rules, status handling (cancelled/returned excluded).
* Formulas: gross, discount, net, AOV (distinct orders).
* Analytics: aggregations, LEFT JOIN for products without sales, window functions (NTILE, share-of-total), RFM scoring.
* Design decisions: batch precompute vs. worker for filters; decimals for money.

**7. Implementation** — Modules (`spark-engine/jobs`, `backend/services`, `frontend/src`), key code excerpts (validation expression, one Spark SQL query, subprocess call, a Recharts component), API table, dashboard pages, filters and CSV export.

**8. Results** — Screenshots of each dashboard page *taken by you from your own run*; data-quality table (input / duplicates / rejected / valid) from the Data Quality page; test results (pytest and `npm test` output); measured timings from your machine. Describe findings only as properties of the synthetic data.

**9. Conclusion** — The system meets the objectives; Spark handled cleaning and aggregation; hand-verified tests give confidence in the formulas; limitations (synthetic data, local mode, no profit data).

**10. Future Scope** — Real public dataset; cluster deployment (YARN/Kubernetes) and Parquet storage; incremental/streaming ingestion (Kafka + Structured Streaming); Delta/warehouse storage; forecasting and churn models with Spark MLlib; authentication and role-based dashboards; cost data for profit analysis; scheduled refreshes.

**References** — Apache Spark documentation (Spark SQL, PySpark), Express, React, Recharts, Vite docs.
