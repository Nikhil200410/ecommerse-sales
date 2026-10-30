#!/usr/bin/env python3
"""Reproducible SYNTHETIC e-commerce order-line generator.

The data is entirely synthetic (fictional brands, random customers) and is
meant for demonstrating the Spark pipeline. It deliberately contains dirty
records (bad dates, quantities, prices, discounts, statuses, missing keys),
format noise (extra spaces, odd casing) and exact duplicate rows, so the
cleaning stage has real work to do.

Usage:
    python generate_data.py                       # ~110k rows -> data/orders.csv
    python generate_data.py --orders 80000 --seed 7 --out data/orders.csv

The same --seed always produces the same file.
"""
import argparse
import csv
import datetime as dt
import random
from pathlib import Path

FIELDS = [
    "order_id", "customer_id", "product_id", "product_name", "category",
    "order_date", "quantity", "unit_price", "discount", "payment_method",
    "order_status", "city", "state",
]

# category -> [(item, min price INR, max price INR)]
CATALOG = {
    "Electronics": [("Smartphone", 8000, 70000), ("Wireless Earbuds", 1200, 12000), ("Smart Watch", 2500, 25000),
                    ("Bluetooth Speaker", 900, 9000), ("Power Bank", 700, 4000), ("Laptop", 30000, 120000)],
    "Fashion": [("T-Shirt", 300, 1800), ("Jeans", 800, 4000), ("Kurta", 600, 3500),
                ("Sneakers", 1200, 8000), ("Jacket", 1500, 7000), ("Saree", 1000, 12000)],
    "Home & Kitchen": [("Mixer Grinder", 1500, 7000), ("Cookware Set", 1200, 8000), ("Bedsheet Set", 500, 3500),
                       ("Air Fryer", 3000, 12000), ("Water Bottle", 200, 1200), ("Dinner Set", 900, 6000)],
    "Beauty": [("Face Wash", 150, 700), ("Moisturiser", 250, 1500), ("Perfume", 500, 5000),
               ("Hair Dryer", 700, 3500), ("Lipstick", 200, 1800), ("Sunscreen", 250, 1200)],
    "Books": [("Novel", 150, 700), ("Self-Help Book", 200, 900), ("Textbook", 400, 2500),
              ("Comic Collection", 200, 1200), ("Cookbook", 300, 1500), ("Biography", 250, 1100)],
    "Sports": [("Yoga Mat", 400, 2500), ("Cricket Bat", 800, 9000), ("Dumbbell Set", 900, 6000),
               ("Football", 400, 2500), ("Badminton Racket", 500, 4500), ("Running Shorts", 300, 1800)],
    "Toys": [("Building Blocks", 300, 3000), ("Board Game", 400, 2500), ("Remote Car", 600, 4000),
             ("Puzzle", 200, 1500), ("Soft Toy", 250, 2000), ("Art Kit", 300, 1800)],
    "Grocery": [("Basmati Rice 5kg", 350, 900), ("Cold Pressed Oil 1L", 200, 800), ("Tea Pack", 150, 700),
                ("Dry Fruit Box", 400, 2000), ("Protein Bar Box", 400, 1800), ("Coffee Beans", 300, 1500)],
    "Furniture": [("Office Chair", 3000, 18000), ("Study Table", 2500, 14000), ("Bookshelf", 2000, 12000),
                  ("Sofa Cushion Set", 500, 3000), ("Shoe Rack", 800, 5000), ("Wardrobe", 8000, 40000)],
    "Accessories": [("Backpack", 600, 4000), ("Wallet", 300, 2500), ("Sunglasses", 500, 6000),
                    ("Phone Case", 150, 1200), ("Belt", 300, 2000), ("Laptop Sleeve", 400, 2500)],
}
BRANDS = ["Aurora", "Zenith", "Nova", "Vertex"]  # fictional

CITIES = [  # city, state, relative weight
    ("Mumbai", "Maharashtra", 14), ("Delhi", "Delhi", 13), ("Bengaluru", "Karnataka", 12),
    ("Hyderabad", "Telangana", 8), ("Chennai", "Tamil Nadu", 7), ("Kolkata", "West Bengal", 6),
    ("Pune", "Maharashtra", 7), ("Ahmedabad", "Gujarat", 5), ("Jaipur", "Rajasthan", 4),
    ("Lucknow", "Uttar Pradesh", 4), ("Surat", "Gujarat", 3), ("Kochi", "Kerala", 3),
    ("Chandigarh", "Chandigarh", 2), ("Indore", "Madhya Pradesh", 3), ("Bhopal", "Madhya Pradesh", 2),
    ("Patna", "Bihar", 2), ("Nagpur", "Maharashtra", 3), ("Coimbatore", "Tamil Nadu", 2),
    ("Visakhapatnam", "Andhra Pradesh", 2), ("Guwahati", "Assam", 1.5),
]

PAYMENTS = [("UPI", 38), ("Credit Card", 20), ("Debit Card", 15), ("Net Banking", 8),
            ("Cash on Delivery", 14), ("Wallet", 5)]
STATUSES = [("Delivered", 77), ("Shipped", 10), ("Cancelled", 7), ("Returned", 6)]
DISCOUNTS = [(0.00, 35), (0.05, 15), (0.10, 20), (0.15, 12), (0.20, 10), (0.25, 5), (0.30, 3)]
MONTH_FACTOR = {1: .9, 2: .85, 3: .95, 4: .95, 5: 1.0, 6: .9, 7: .9, 8: 1.0, 9: 1.05, 10: 1.4, 11: 1.35, 12: 1.2}

START = dt.date(2024, 1, 1)
END = dt.date(2025, 12, 31)


def weighted(rng, pairs):
    values, weights = zip(*pairs)
    return rng.choices(values, weights=weights, k=1)[0]


def build_products(rng):
    products = []
    for category, items in CATALOG.items():
        for item, lo, hi in items:
            for brand in BRANDS:
                price = lo * ((hi / lo) ** rng.random())
                price = max(9, int(price / 10) * 10 - 1)  # price points ending in 9
                products.append({"id": f"P{len(products) + 1:04d}", "name": f"{brand} {item}",
                                 "category": category, "price": price})
    rng.shuffle(products)
    # Zipf-like popularity: a few best sellers, a long tail of slow movers
    weights = [1.0 / ((rank + 1) ** 0.85) for rank in range(len(products))]
    return products, weights


def build_calendar():
    days, weights = [], []
    span = (END - START).days
    for i in range(span + 1):
        d = START + dt.timedelta(days=i)
        w = MONTH_FACTOR[d.month] * (1 + 0.5 * i / span) * (1.12 if d.weekday() >= 5 else 1.0)
        days.append(d)
        weights.append(w)
    return days, weights


def corrupt(rng, row):
    """Inject one realistic data-quality defect into a row. Returns defect name."""
    kind = rng.choice(["bad_date", "bad_qty", "bad_price", "bad_discount",
                       "bad_status", "missing_customer", "missing_product"])
    if kind == "bad_date":
        row["order_date"] = rng.choice(["2025-13-45", "not-a-date", "31/12/2024", "2024-02-30", ""])
    elif kind == "bad_qty":
        row["quantity"] = rng.choice(["0", "-2", "abc", "1.5", ""])
    elif kind == "bad_price":
        row["unit_price"] = rng.choice(["0", "-199", "N/A", ""])
    elif kind == "bad_discount":
        row["discount"] = rng.choice(["1.5", "-0.1", "abc", "20"])
    elif kind == "bad_status":
        row["order_status"] = rng.choice(["Unknown", "Lost", "???", ""])
    elif kind == "missing_customer":
        row["customer_id"] = ""
    else:
        row["product_id"] = ""
    return kind


def noise(rng, row):
    """Harmless formatting noise that cleaning should repair (not reject)."""
    if rng.random() < 0.5:
        row["order_status"] = rng.choice([row["order_status"].lower(), row["order_status"].upper(),
                                          f"  {row['order_status']} "])
    else:
        row["payment_method"] = rng.choice([row["payment_method"].lower(), row["payment_method"].upper(),
                                            f" {row['payment_method']}  "])
    if rng.random() < 0.3:
        row["city"] = row["city"].lower()


def generate(orders, seed, dirty_rate, noise_rate, dup_rate):
    rng = random.Random(seed)
    products, product_weights = build_products(rng)
    days, day_weights = build_calendar()

    n_customers = max(100, orders // 3)
    customers = []
    for i in range(n_customers):
        city, state, _ = rng.choices(CITIES, weights=[c[2] for c in CITIES], k=1)[0]
        customers.append((f"C{i + 1:06d}", city, state))
    # heavy buyers vs occasional buyers
    customer_weights = [1.0 / ((i + 1) ** 0.45) for i in range(n_customers)]
    rng.shuffle(customer_weights)

    rows, injected = [], {"dirty": 0, "noise": 0, "duplicates": 0}
    for n in range(1, orders + 1):
        order_id = f"ORD-{n:07d}"
        cust_id, city, state = rng.choices(customers, weights=customer_weights, k=1)[0]
        date = rng.choices(days, weights=day_weights, k=1)[0].isoformat()
        payment = weighted(rng, PAYMENTS)
        status = weighted(rng, STATUSES)
        n_lines = weighted(rng, [(1, 35), (2, 30), (3, 22), (4, 13)])
        chosen = set()
        while len(chosen) < n_lines:
            chosen.add(rng.choices(range(len(products)), weights=product_weights, k=1)[0])
        for idx in sorted(chosen):
            p = products[idx]
            row = {
                "order_id": order_id, "customer_id": cust_id, "product_id": p["id"],
                "product_name": p["name"], "category": p["category"], "order_date": date,
                "quantity": str(weighted(rng, [(1, 55), (2, 25), (3, 10), (4, 6), (5, 4)])),
                "unit_price": str(p["price"]), "discount": f"{weighted(rng, DISCOUNTS):.2f}",
                "payment_method": payment, "order_status": status, "city": city, "state": state,
            }
            if rng.random() < dirty_rate:
                corrupt(rng, row)
                injected["dirty"] += 1
            elif rng.random() < noise_rate:
                noise(rng, row)
                injected["noise"] += 1
            rows.append(row)

    n_dups = int(len(rows) * dup_rate)
    for src in rng.sample(range(len(rows)), n_dups):
        rows.insert(rng.randrange(len(rows) + 1), dict(rows[src]))
    injected["duplicates"] = n_dups
    return rows, injected


def main():
    parser = argparse.ArgumentParser(description="Generate a reproducible synthetic e-commerce CSV.")
    parser.add_argument("--orders", type=int, default=52000, help="number of orders (~2.1 lines each)")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dirty-rate", type=float, default=0.03, help="share of lines with a defect")
    parser.add_argument("--noise-rate", type=float, default=0.03, help="share of lines with harmless noise")
    parser.add_argument("--dup-rate", type=float, default=0.012, help="share of extra exact duplicate rows")
    default_out = Path(__file__).resolve().parent / "data" / "orders.csv"
    parser.add_argument("--out", type=Path, default=default_out)
    args = parser.parse_args()

    rows, injected = generate(args.orders, args.seed, args.dirty_rate, args.noise_rate, args.dup_rate)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows):,} rows to {args.out} (seed={args.seed}, SYNTHETIC data)")
    print(f"Injected: {injected['dirty']:,} defective lines, {injected['noise']:,} noisy lines, "
          f"{injected['duplicates']:,} duplicate rows")


if __name__ == "__main__":
    main()
