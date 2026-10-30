# Viva Questions and Answers

**1. What is Apache Spark?**
An open-source engine for large-scale data processing. It splits data into partitions and processes them in parallel across CPU cores or machines, keeping intermediate data in memory where possible.

**2. What is PySpark?**
The Python API for Spark. Python code builds DataFrame/SQL operations; the work itself runs in Spark's JVM engine.

**3. Why is Spark appropriate here, and is it overkill for 112k rows?**
The data fits one machine, so Spark is not *needed* for speed at this size. It is used because the pipeline is written once as DataFrame/SQL and would scale unchanged to millions of rows or a cluster, and because it demonstrates ETL, SQL and window functions on a real engine. (Pandas would be faster for this size; I say so honestly.)

**4. What is a DataFrame?**
A distributed table with named, typed columns. Operations (`filter`, `groupBy`, `join`) are transformations that Spark optimises before running.

**5. What is Spark SQL and how is it used here?**
A module that lets you query DataFrames with SQL via temp views (`spark.sql("SELECT … FROM sales")`). All dashboard aggregations (revenue, top products, RFM, payment share) are Spark SQL queries; Catalyst optimises them.

**6. What is lazy evaluation?**
Transformations only build a plan; nothing runs until an action (`count`, `collect`, `show`) is called. This lets Spark optimise the whole plan. We call `cache()` and `count()` so the cleaned data is computed once and reused.

**7. Transformation vs action?**
Transformations (`filter`, `select`, `groupBy`) return a new DataFrame and are lazy. Actions (`count`, `collect`, write) trigger execution and return results.

**8. What is distributed processing?**
Splitting data into partitions processed in parallel by executors. Here Spark runs in *local mode* (`local[*]`): partitions are processed in parallel by threads on one machine — same programming model as a cluster.

**9. What is ETL and where is it in this project?**
Extract–Transform–Load. Extract: read the CSV. Transform: trim, de-duplicate, validate, convert types, compute revenue columns. Load: write analytics JSON for the API (and keep the cleaned data cached for the worker).

**10. How do you handle bad data?**
Rows are validated by rules (missing IDs, bad date/quantity/price/discount/status). The first failing rule is stored as the reject reason, rejected rows are counted by reason, and the invariant *input = duplicates + rejected + valid* is checked and shown on the Data Quality page.

**11. Why precompute results instead of running Spark per request?**
Starting a Spark session costs many seconds. The batch job computes the unfiltered results once into JSON. Filtered requests use one long-lived Spark session (the worker) with cached data, and results are cached per filter combination.

**12. How does Node.js talk to Spark?**
Through a controlled subprocess: Node spawns Python with an argument array (no shell, so no command injection). The batch job communicates by files plus a status file; the worker uses one JSON object per line over stdin/stdout.

**13. Why can't filtered distinct counts be calculated by adding precomputed totals?**
Distinct counts are not additive: a customer who ordered in January and February would be counted twice if you summed monthly distinct customers. So Spark recalculates them for the filtered data.

**14. How is average order value calculated and why distinct orders?**
Total net revenue ÷ number of distinct valid orders. An order can have several lines; counting lines would understate AOV.

**15. What is RFM analysis?**
Segmenting customers by Recency (days since last order), Frequency (number of orders) and Monetary value (net spend). Scores 1–5 are assigned (`NTILE` for R and M, thresholds for F) and rules map them to segments such as Champions or At Risk.

**Bonus — What do REST APIs return here, and how are errors handled?**
JSON in a fixed envelope `{success, data, meta}`; errors use `{success:false, error:{code,message}}` with proper HTTP codes (400 invalid filter, 503 no results yet, 404 unknown export).
