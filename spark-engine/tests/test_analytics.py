"""Checks the Spark pipeline against values worked out by hand from test_orders.csv.

Hand calculation (revenue-eligible = Delivered/Shipped lines):
  gross 28,200  | discount 3,000 | net 25,200 | orders 6 | units 22 | customers 4 | AOV 4,200
  16 input rows = 1 duplicate + 6 rejected + 9 valid (7 eligible, 1 cancelled, 1 returned)
"""
import pytest

from jobs.aggregations import compute_analytics


@pytest.fixture(scope="module")
def full(spark, cleaned):
    return compute_analytics(spark, cleaned[0], {})


def test_data_quality_counts(cleaned):
    q = cleaned[1]
    assert q["input_records"] == 16
    assert q["duplicate_records"] == 1
    assert q["rejected_records"] == 6
    assert q["valid_records"] == 9
    assert q["balance_check_ok"] is True
    assert q["rejected_by_reason"] == {
        "missing_key": 1, "invalid_date": 1, "invalid_quantity": 1,
        "invalid_unit_price": 1, "invalid_discount": 1, "invalid_order_status": 1,
    }
    assert q["revenue_eligible_records"] == 7
    assert q["excluded_records"] == {"Cancelled": 1, "Returned": 1}


def test_revenue_discount_and_distinct_orders(full):
    o = full["overview"]
    assert o["gross_revenue"] == 28200.00
    assert o["discount_amount"] == 3000.00
    assert o["net_revenue"] == 25200.00
    assert o["gross_revenue"] - o["discount_amount"] == o["net_revenue"]
    assert o["valid_orders"] == 6          # O1 has two lines but is ONE order
    assert o["units_sold"] == 22
    assert o["purchasing_customers"] == 4
    assert o["average_order_value"] == 4200.00
    assert o["excluded"]["Cancelled"] == {"orders": 1, "value": 1440.00}
    assert o["excluded"]["Returned"] == {"orders": 1, "value": 1000.00}


def test_spark_sql_product_and_category_aggregation(full):
    p = full["products"]
    assert [(r["product_name"], r["net_revenue"]) for r in p["top_by_revenue"]] == [
        ("Phone", 19000.0), ("Shirt", 2600.0), ("Case", 2000.0), ("Book", 1600.0)]
    assert [(r["product_name"], r["units_sold"]) for r in p["top_by_quantity"]] == [
        ("Book", 10), ("Case", 6), ("Shirt", 4), ("Phone", 2)]
    assert {r["category"]: r["net_revenue"] for r in p["by_category"]} == {
        "Electronics": 19000.0, "Fashion": 2600.0, "Accessories": 2000.0, "Books": 1600.0}
    assert p["low_performers"][0]["product_name"] == "Book"  # lowest revenue (1,600)


def test_trends_geography_payments(full):
    assert [(r["month"], r["net_revenue"], r["orders"]) for r in full["trends"]["monthly"]] == [
        ("2025-01", 11000.0, 2), ("2025-02", 11800.0, 2), ("2025-03", 1600.0, 1), ("2025-04", 800.0, 1)]
    assert len(full["trends"]["daily"]) == 6
    assert {r["city"]: (r["net_revenue"], r["orders"]) for r in full["geography"]["by_city"]} == {
        "Mumbai": (11800.0, 2), "Bengaluru": (10800.0, 2), "Delhi": (1000.0, 1), "Pune": (1600.0, 1)}
    assert {r["payment_method"]: (r["orders"], r["net_revenue"]) for r in full["payments"]} == {
        "UPI": (4, 14200.0), "Credit Card": (1, 1000.0), "Net Banking": (1, 10000.0)}


def test_customers(full):
    c = full["customers"]
    assert {r["buyer_type"]: r["customers"] for r in c["repeat_vs_onetime"]} == {"Repeat": 2, "One-time": 2}
    # C1 = O1 (9000 + 1000) + O3 (1800) = 11,800 over 2 orders and 6 units; C3 = 10,800
    assert c["top_spenders"][0] == {"customer_id": "C1", "orders": 2, "units": 6, "net_revenue": 11800.0}
    assert c["top_spenders"][1]["customer_id"] == "C3"
    assert sum(r["customers"] for r in c["rfm_segments"]) == 4


def test_filters(spark, cleaned):
    electronics = compute_analytics(spark, cleaned[0], {"category": "Electronics"})["overview"]
    assert (electronics["net_revenue"], electronics["valid_orders"], electronics["units_sold"]) == (19000.0, 2, 2)

    february = compute_analytics(spark, cleaned[0], {"start": "2025-02-01", "end": "2025-02-28"})["overview"]
    assert (february["net_revenue"], february["valid_orders"]) == (11800.0, 2)

    mumbai = compute_analytics(spark, cleaned[0], {"city": "Mumbai"})["overview"]
    assert (mumbai["net_revenue"], mumbai["valid_orders"]) == (11800.0, 2)


def test_empty_result_is_graceful(spark, cleaned):
    empty = compute_analytics(spark, cleaned[0], {"start": "2030-01-01"})
    assert empty["overview"]["has_data"] is False
    assert empty["overview"]["net_revenue"] == 0
    assert empty["overview"]["average_order_value"] == 0
    assert empty["trends"]["daily"] == [] and empty["payments"] == []
