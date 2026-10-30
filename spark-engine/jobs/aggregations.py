"""Stage 2 - analytics: Spark SQL aggregations over the cleaned DataFrame.

`compute_analytics(spark, clean_df, filters)` is used both by the one-off batch job
(no filters -> precomputed JSON) and by the long-lived worker (filtered requests).
All figures come from Spark SQL; nothing here is faked or estimated.
"""
from pyspark.sql import functions as F

from .cleaning import EXCLUDED_STATUSES, REVENUE_STATUSES
from .io_utils import first_row, rows

FILTER_KEYS = ("start", "end", "category", "city")


def normalise_filters(filters):
    filters = filters or {}
    return {k: (filters.get(k) or None) for k in FILTER_KEYS}


def apply_filters(clean_df, f):
    df = clean_df
    if f["start"]:
        df = df.filter(F.col("order_date") >= F.lit(f["start"]).cast("date"))
    if f["end"]:
        df = df.filter(F.col("order_date") <= F.lit(f["end"]).cast("date"))
    if f["category"]:
        df = df.filter(F.col("category") == F.lit(f["category"]))
    if f["city"]:
        df = df.filter(F.col("city") == F.lit(f["city"]))
    return df


def build_meta(clean_df):
    """Filter options and date range of the whole cleaned dataset."""
    bounds = first_row(clean_df.agg(F.min("order_date").alias("min_date"), F.max("order_date").alias("max_date")))
    categories = [r["category"] for r in rows(clean_df.select("category").distinct().orderBy("category"))]
    cities = [r["city"] for r in rows(clean_df.select("city").distinct().orderBy("city"))]
    return {"min_date": bounds.get("min_date"), "max_date": bounds.get("max_date"),
            "categories": categories, "cities": cities}


def compute_analytics(spark, clean_df, filters=None):
    f = normalise_filters(filters)
    scoped = apply_filters(clean_df, f)
    scoped.createOrReplaceTempView("sales_all")  # valid lines, every status
    scoped.filter(F.col("order_status").isin(REVENUE_STATUSES)).createOrReplaceTempView("sales")

    # Product dimension: every valid product (category filter applies, date/city do not),
    # so products with NO sales in the selected window show up as zero-revenue via a LEFT JOIN.
    dim = clean_df
    if f["category"]:
        dim = dim.filter(F.col("category") == F.lit(f["category"]))
    dim.groupBy("product_id").agg(F.min("product_name").alias("product_name"),
                                  F.min("category").alias("category")).createOrReplaceTempView("product_dim")

    sql = spark.sql

    overview = first_row(sql("""
        SELECT COALESCE(SUM(gross_revenue), 0)   AS gross_revenue,
               COALESCE(SUM(discount_amount), 0) AS discount_amount,
               COALESCE(SUM(net_revenue), 0)     AS net_revenue,
               COUNT(DISTINCT order_id)          AS valid_orders,
               COALESCE(SUM(quantity), 0)        AS units_sold,
               COUNT(DISTINCT customer_id)       AS purchasing_customers,
               CASE WHEN COUNT(DISTINCT order_id) = 0 THEN 0
                    ELSE ROUND(SUM(net_revenue) / COUNT(DISTINCT order_id), 2) END AS average_order_value,
               CASE WHEN COALESCE(SUM(gross_revenue), 0) = 0 THEN 0
                    ELSE ROUND(100 * SUM(discount_amount) / SUM(gross_revenue), 2) END AS discount_rate_pct
        FROM sales
    """))

    excluded = rows(sql(f"""
        SELECT order_status AS status, COUNT(DISTINCT order_id) AS orders, COALESCE(SUM(net_revenue), 0) AS value
        FROM sales_all WHERE order_status IN ({", ".join(repr(s) for s in EXCLUDED_STATUSES)})
        GROUP BY order_status ORDER BY order_status
    """))
    excluded_map = {s: {"orders": 0, "value": 0.0} for s in EXCLUDED_STATUSES}
    for r in excluded:
        excluded_map[r["status"]] = {"orders": r["orders"], "value": r["value"]}
    overview["excluded"] = excluded_map
    overview["has_data"] = (overview["valid_orders"] or 0) > 0

    trends = {
        "daily": rows(sql("""
            SELECT order_date AS date, ROUND(SUM(net_revenue), 2) AS net_revenue,
                   COUNT(DISTINCT order_id) AS orders, SUM(quantity) AS units
            FROM sales GROUP BY order_date ORDER BY order_date
        """)),
        "monthly": rows(sql("""
            SELECT date_format(order_date, 'yyyy-MM') AS month, ROUND(SUM(net_revenue), 2) AS net_revenue,
                   COUNT(DISTINCT order_id) AS orders, SUM(quantity) AS units
            FROM sales GROUP BY date_format(order_date, 'yyyy-MM') ORDER BY month
        """)),
    }

    products = {
        "top_by_revenue": rows(sql("""
            SELECT product_id, product_name, category, ROUND(SUM(net_revenue), 2) AS net_revenue,
                   SUM(quantity) AS units_sold
            FROM sales GROUP BY product_id, product_name, category
            ORDER BY net_revenue DESC, product_id LIMIT 10
        """)),
        "top_by_quantity": rows(sql("""
            SELECT product_id, product_name, category, SUM(quantity) AS units_sold,
                   ROUND(SUM(net_revenue), 2) AS net_revenue
            FROM sales GROUP BY product_id, product_name, category
            ORDER BY units_sold DESC, product_id LIMIT 10
        """)),
        "by_category": rows(sql("""
            SELECT category, ROUND(SUM(net_revenue), 2) AS net_revenue, SUM(quantity) AS units_sold,
                   COUNT(DISTINCT order_id) AS orders
            FROM sales GROUP BY category ORDER BY net_revenue DESC
        """)),
        "low_performers": rows(sql("""
            SELECT d.product_id, d.product_name, d.category,
                   COALESCE(a.net_revenue, 0) AS net_revenue, COALESCE(a.units_sold, 0) AS units_sold
            FROM product_dim d
            LEFT JOIN (SELECT product_id, ROUND(SUM(net_revenue), 2) AS net_revenue, SUM(quantity) AS units_sold
                       FROM sales GROUP BY product_id) a
              ON d.product_id = a.product_id
            ORDER BY net_revenue ASC, units_sold ASC, d.product_id LIMIT 10
        """)),
    }

    customers = {
        "top_spenders": rows(sql("""
            SELECT customer_id, COUNT(DISTINCT order_id) AS orders, SUM(quantity) AS units,
                   ROUND(SUM(net_revenue), 2) AS net_revenue
            FROM sales GROUP BY customer_id ORDER BY net_revenue DESC, customer_id LIMIT 10
        """)),
        "repeat_vs_onetime": rows(sql("""
            WITH per_customer AS (
                SELECT customer_id, COUNT(DISTINCT order_id) AS orders, SUM(net_revenue) AS revenue
                FROM sales GROUP BY customer_id)
            SELECT CASE WHEN orders > 1 THEN 'Repeat' ELSE 'One-time' END AS buyer_type,
                   COUNT(*) AS customers, ROUND(SUM(revenue), 2) AS net_revenue
            FROM per_customer GROUP BY CASE WHEN orders > 1 THEN 'Repeat' ELSE 'One-time' END
            ORDER BY buyer_type DESC
        """)),
        "rfm_segments": rows(sql("""
            WITH ref AS (SELECT date_add(MAX(order_date), 1) AS ref_date FROM sales),
            cust AS (
                SELECT customer_id,
                       datediff((SELECT ref_date FROM ref), MAX(order_date)) AS recency_days,
                       COUNT(DISTINCT order_id) AS frequency,
                       SUM(net_revenue) AS monetary
                FROM sales GROUP BY customer_id),
            scored AS (
                SELECT *,
                       NTILE(5) OVER (ORDER BY recency_days DESC) AS r,
                       CASE WHEN frequency >= 6 THEN 5 WHEN frequency >= 4 THEN 4
                            WHEN frequency = 3 THEN 3 WHEN frequency = 2 THEN 2 ELSE 1 END AS f,
                       NTILE(5) OVER (ORDER BY monetary ASC) AS m
                FROM cust),
            segmented AS (
                SELECT *,
                       CASE WHEN r >= 4 AND f >= 4 THEN 'Champions'
                            WHEN f >= 4 THEN 'Loyal Customers'
                            WHEN r >= 3 AND f >= 2 THEN 'Potential Loyalists'
                            WHEN r >= 4 AND f = 1 THEN 'New Customers'
                            WHEN r <= 2 AND f >= 2 THEN 'At Risk'
                            WHEN r <= 2 AND f = 1 THEN 'Hibernating'
                            ELSE 'Needs Attention' END AS segment
                FROM scored)
            SELECT segment, COUNT(*) AS customers, ROUND(SUM(monetary), 2) AS net_revenue,
                   ROUND(AVG(recency_days), 1) AS avg_recency_days, ROUND(AVG(frequency), 2) AS avg_orders
            FROM segmented GROUP BY segment ORDER BY net_revenue DESC
        """)),
    }

    geography = {
        "by_city": rows(sql("""
            SELECT city, state, ROUND(SUM(net_revenue), 2) AS net_revenue, COUNT(DISTINCT order_id) AS orders
            FROM sales GROUP BY city, state ORDER BY net_revenue DESC, city
        """)),
        "by_state": rows(sql("""
            SELECT state, ROUND(SUM(net_revenue), 2) AS net_revenue, COUNT(DISTINCT order_id) AS orders
            FROM sales GROUP BY state ORDER BY net_revenue DESC, state
        """)),
    }

    payments = rows(sql("""
        SELECT payment_method, COUNT(DISTINCT order_id) AS orders, ROUND(SUM(net_revenue), 2) AS net_revenue,
               ROUND(100 * SUM(net_revenue) / SUM(SUM(net_revenue)) OVER (), 2) AS revenue_share_pct
        FROM sales GROUP BY payment_method ORDER BY net_revenue DESC
    """))

    return {
        "filters": f,
        "overview": overview,
        "trends": trends,
        "products": products,
        "customers": customers,
        "geography": geography,
        "payments": payments,
    }
