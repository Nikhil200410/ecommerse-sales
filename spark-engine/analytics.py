#!/usr/bin/env python3
"""Batch job: clean the raw CSV with Spark, compute analytics with Spark SQL, save JSON.

    python analytics.py batch --input data/orders.csv --output ../output

Writes to the local output directory (atomically):
    analytics.json     unfiltered analytics for the whole dataset (served instantly by the API)
    data_quality.json  record counts, rejection reasons, processing status
    meta.json          filter options and date range
    status.json        job state: running | succeeded | failed

When DATA_SOURCE=s3 (or ANALYTICS_INPUT is s3a://...), Spark reads the CSV through S3A.
When S3_WRITE_RESULTS is enabled (default if DATA_SOURCE=s3), the same JSON files are
copied to s3://$S3_BUCKET/$S3_OUTPUT_PREFIX/.
"""
import argparse
import csv
import datetime as dt
import sys
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from jobs.aggregations import build_meta, compute_analytics  # noqa: E402
from jobs.cleaning import clean, read_raw  # noqa: E402
from jobs.io_utils import write_json_atomic  # noqa: E402
from jobs.s3_io import maybe_upload_results  # noqa: E402
from jobs.session import build_spark  # noqa: E402
from jobs.storage import (  # noqa: E402
    StorageConfigError,
    classify_io_error,
    is_remote,
    resolve_input,
    resolve_output_dir,
    s3_writes_enabled,
    source_label,
)


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _write_overview_csv(output_dir: Path, overview: dict):
    """Small KPI report next to the JSON (uploaded to S3 with the other results)."""
    path = output_dir / "overview_kpis.csv"
    fields = [
        "gross_revenue", "discount_amount", "net_revenue", "valid_orders",
        "units_sold", "purchasing_customers", "average_order_value", "discount_rate_pct",
    ]
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(fields)
        writer.writerow([overview.get(k, "") for k in fields])


def run_batch(input_uri: str, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    status_file = output_dir / "status.json"
    started = time.time()
    write_json_atomic(status_file, {
        "state": "running",
        "started_at": now_iso(),
        "input": input_uri,
        "data_source": "s3" if is_remote(input_uri) else "local",
    })

    spark = None
    try:
        if not is_remote(input_uri) and not Path(input_uri).is_file():
            raise FileNotFoundError(
                f"Input CSV not found: {input_uri}. Run generate_data.py first, "
                "or set DATA_SOURCE=s3 and S3_BUCKET after uploading the file."
            )
        spark = build_spark(input_uri=input_uri)
        clean_df, quality = clean(read_raw(spark, input_uri))
        analytics = compute_analytics(spark, clean_df, {})
        meta = build_meta(clean_df)

        duration = round(time.time() - started, 1)
        quality.update({
            "status": "succeeded",
            "processed_at": now_iso(),
            "duration_seconds": duration,
            "source_file": source_label(input_uri),
            "data_source": "s3" if is_remote(input_uri) else "local",
            "spark_version": spark.version,
        })
        analytics["generated_at"] = quality["processed_at"]
        write_json_atomic(output_dir / "analytics.json", analytics)
        write_json_atomic(output_dir / "data_quality.json", quality)
        write_json_atomic(output_dir / "meta.json", meta)
        _write_overview_csv(output_dir, analytics.get("overview") or {})
        write_json_atomic(status_file, {
            "state": "succeeded",
            "started_at": now_iso(),
            "finished_at": now_iso(),
            "duration_seconds": duration,
            "input": input_uri,
            "data_source": quality["data_source"],
        })
        uploaded = []
        if s3_writes_enabled():
            uploaded = maybe_upload_results(output_dir, extra=["overview_kpis.csv"])
        print(
            f"Spark batch finished in {duration}s: {quality['input_records']:,} input, "
            f"{quality['valid_records']:,} valid, {quality['rejected_records']:,} rejected, "
            f"{quality['duplicate_records']:,} duplicates. Output: {output_dir}"
            + (f" Uploaded: {', '.join(uploaded)}" if uploaded else "")
        )
        return 0
    except Exception as exc:  # noqa: BLE001 - report any failure through status.json
        traceback.print_exc()
        message = str(exc) if isinstance(exc, StorageConfigError) else classify_io_error(exc)
        write_json_atomic(status_file, {
            "state": "failed",
            "finished_at": now_iso(),
            "error": message,
            "input": input_uri,
        })
        print(message, file=sys.stderr)
        return 1
    finally:
        if spark is not None:
            spark.stop()


def main():
    parser = argparse.ArgumentParser(description="E-commerce sales analytics (PySpark batch job)")
    sub = parser.add_subparsers(dest="command", required=True)
    batch = sub.add_parser("batch", help="clean data and write analytics JSON")
    batch.add_argument("--input", default=None, help="Local CSV path or s3a://bucket/key")
    batch.add_argument("--output", default=None, help="Local directory for JSON results")
    args = parser.parse_args()
    if args.command == "batch":
        try:
            input_uri = resolve_input(args.input)
            output_dir = resolve_output_dir(args.output).resolve()
        except StorageConfigError as exc:
            print(str(exc), file=sys.stderr)
            sys.exit(2)
        sys.exit(run_batch(input_uri, output_dir))


if __name__ == "__main__":
    main()
