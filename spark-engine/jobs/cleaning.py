"""Stage 1 - ETL: read the raw CSV, normalise, de-duplicate and validate with Spark.

Business rules (also documented in the README):

* Everything is read as strings, trimmed, and blank strings become NULL.
* Exact duplicate rows (after trimming) are dropped; the first copy is kept.
* A row is REJECTED when any of these fail (first failing rule is recorded):
    missing_key          order_id / customer_id / product_id is empty
    invalid_date         not yyyy-MM-dd, not a real calendar date, before 2000-01-01 or in the future
    invalid_quantity     not a whole number in 1..10000
    invalid_unit_price   not a number in (0, 1e9)
    invalid_discount     not a number in [0, 1]; discount is a FRACTION (0.10 = 10 %).
                         An empty discount means "no discount" (0). Values such as 10 or 20 are
                         rejected, never guessed to be percentages.
    invalid_order_status not one of Delivered, Shipped, Cancelled/Canceled, Returned (case-insensitive)
* Valid rows keep their status. Revenue metrics only use Delivered and Shipped lines.
  Cancelled and Returned lines are valid records but are EXCLUDED from revenue, orders,
  units and customers; they are reported separately as "excluded".
* gross = quantity x unit_price, discount_amount = gross x discount, net = gross - discount_amount
  (money columns are DECIMAL(18,2), so sums are exact).
"""
from pyspark.sql import DataFrame, functions as F

ALL_COLUMNS = [
    "order_id", "customer_id", "product_id", "product_name", "category", "order_date",
    "quantity", "unit_price", "discount", "payment_method", "order_status", "city", "state",
]
REQUIRED_COLUMNS = ["order_id", "customer_id", "product_id", "order_date", "quantity", "unit_price", "order_status"]
OPTIONAL_COLUMNS = [c for c in ALL_COLUMNS if c not in REQUIRED_COLUMNS]

REVENUE_STATUSES = ["Delivered", "Shipped"]
EXCLUDED_STATUSES = ["Cancelled", "Returned"]
STATUS_MAP = {"delivered": "Delivered", "shipped": "Shipped", "cancelled": "Cancelled",
              "canceled": "Cancelled", "returned": "Returned"}
PAYMENT_MAP = {"upi": "UPI", "credit card": "Credit Card", "debit card": "Debit Card",
               "net banking": "Net Banking", "cash on delivery": "Cash on Delivery",
               "cod": "Cash on Delivery", "wallet": "Wallet"}
REJECT_REASONS = ["missing_key", "invalid_date", "invalid_quantity", "invalid_unit_price",
                  "invalid_discount", "invalid_order_status"]


def _lookup(mapping, column):
    pairs = []
    for key, value in mapping.items():
        pairs += [F.lit(key), F.lit(value)]
    return F.create_map(*pairs)[F.lower(column)]


def read_raw(spark, path) -> DataFrame:
    """Read the CSV with every column as a string (no schema inference)."""
    df = (spark.read.option("header", True).option("inferSchema", False)
          .option("mode", "PERMISSIVE").csv(str(path)))
    df = df.toDF(*[c.strip().lower() for c in df.columns])
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Input CSV is missing required column(s): {', '.join(missing)}. "
                         f"Found: {', '.join(df.columns)}")
    for column in OPTIONAL_COLUMNS:  # adapt to datasets that lack optional fields
        if column not in df.columns:
            df = df.withColumn(column, F.lit(None).cast("string"))
    return df.select(*ALL_COLUMNS)


def _blank_to_null(column):
    trimmed = F.trim(column)
    return F.when(F.length(trimmed) == 0, F.lit(None)).otherwise(trimmed)


def clean(raw: DataFrame):
    """Return (clean_df, quality_dict). clean_df is cached and contains only valid rows."""
    trimmed = raw.select(*[_blank_to_null(F.col(c)).alias(c) for c in ALL_COLUMNS])

    input_records = trimmed.count()
    deduped = trimmed.dropDuplicates().cache()
    deduped_records = deduped.count()
    duplicate_records = input_records - deduped_records

    # --- validation expressions -------------------------------------------------
    date_text = F.col("order_date")
    order_date = F.when(date_text.rlike(r"^\d{4}-\d{2}-\d{2}$"), F.to_date(date_text, "yyyy-MM-dd"))
    date_ok = (order_date.isNotNull()
               & (order_date >= F.lit("2000-01-01").cast("date"))
               & (order_date <= F.current_date()))

    qty = F.col("quantity").cast("double")
    qty_ok = qty.isNotNull() & (qty > 0) & (qty <= 10000) & (qty == F.floor(qty))

    price = F.col("unit_price").cast("double")
    # NaN compares greater than every number in Spark, so "< 1e9" also rejects NaN/Infinity.
    price_ok = price.isNotNull() & (price > 0) & (price < 1e9)

    discount = F.when(F.col("discount").isNull(), F.lit(0.0)).otherwise(F.col("discount").cast("double"))
    discount_ok = discount.isNotNull() & (discount >= 0) & (discount <= 1)

    status = _lookup(STATUS_MAP, F.col("order_status"))
    status_ok = status.isNotNull()
    keys_ok = (F.col("order_id").isNotNull() & F.col("customer_id").isNotNull()
               & F.col("product_id").isNotNull())

    reason = (F.when(~keys_ok, "missing_key")
              .when(~date_ok, "invalid_date")
              .when(~qty_ok, "invalid_quantity")
              .when(~price_ok, "invalid_unit_price")
              .when(~discount_ok, "invalid_discount")
              .when(~status_ok, "invalid_order_status"))

    validated = deduped.withColumn("reject_reason", reason).cache()
    reason_counts = {r["reject_reason"]: r["count"]
                     for r in validated.groupBy("reject_reason").count().collect() if r["reject_reason"]}
    rejected_records = sum(reason_counts.values())

    # --- build the clean table ----------------------------------------------------
    valid = validated.filter(F.col("reject_reason").isNull())
    gross = F.round(qty.cast("int") * price, 2).cast("decimal(18,2)")
    discount_amount = F.round(gross.cast("double") * discount, 2).cast("decimal(18,2)")

    typed = valid.select(
        F.col("order_id"),
        F.col("customer_id"),
        F.col("product_id"),
        F.coalesce(F.col("product_name"), F.col("product_id")).alias("product_name"),
        F.coalesce(F.col("category"), F.lit("Uncategorized")).alias("category"),
        order_date.alias("order_date"),
        qty.cast("int").alias("quantity"),
        price.alias("unit_price"),
        discount.alias("discount"),
        F.coalesce(_lookup(PAYMENT_MAP, F.col("payment_method")), F.initcap(F.col("payment_method")),
                   F.lit("Unknown")).alias("payment_method"),
        status.alias("order_status"),
        F.coalesce(F.initcap(F.col("city")), F.lit("Unknown")).alias("city"),
        F.coalesce(F.initcap(F.col("state")), F.lit("Unknown")).alias("state"),
        gross.alias("gross_revenue"),
        discount_amount.alias("discount_amount"),
    ).withColumn("net_revenue", (F.col("gross_revenue") - F.col("discount_amount")).cast("decimal(18,2)"))

    clean_df = typed.cache()
    valid_records = clean_df.count()

    status_breakdown = {r["order_status"]: r["count"]
                        for r in clean_df.groupBy("order_status").count().collect()}
    quality = {
        "input_records": input_records,
        "duplicate_records": duplicate_records,
        "rejected_records": rejected_records,
        "rejected_by_reason": {r: reason_counts.get(r, 0) for r in REJECT_REASONS},
        "valid_records": valid_records,
        "revenue_eligible_records": sum(status_breakdown.get(s, 0) for s in REVENUE_STATUSES),
        "excluded_records": {s: status_breakdown.get(s, 0) for s in EXCLUDED_STATUSES},
        "status_breakdown": status_breakdown,
        "balance_check_ok": input_records == duplicate_records + rejected_records + valid_records,
    }
    return clean_df, quality
