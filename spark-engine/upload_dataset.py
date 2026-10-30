#!/usr/bin/env python3
"""Upload the local synthetic CSV to a private S3 prefix (never makes the object public).

    python spark-engine/upload_dataset.py
    python spark-engine/upload_dataset.py --file spark-engine/data/orders.csv

Requires S3_BUCKET (and AWS_REGION). Uses the default credential chain — no keys in code.
"""
import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from jobs.s3_io import _client  # noqa: E402
from jobs.storage import (  # noqa: E402
    DEFAULT_LOCAL_INPUT,
    classify_io_error,
    require_bucket,
    s3_input_key,
)


def main():
    parser = argparse.ArgumentParser(description="Upload the e-commerce CSV to private S3")
    parser.add_argument("--file", default=str(DEFAULT_LOCAL_INPUT), help="Local CSV path")
    args = parser.parse_args()
    path = Path(args.file)
    if not path.is_file():
        print(f"Local CSV not found: {path}. Run generate_data.py first.", file=sys.stderr)
        sys.exit(1)
    try:
        bucket = require_bucket()
        key = s3_input_key()
        _client().upload_file(
            str(path),
            bucket,
            key,
            ExtraArgs={"ServerSideEncryption": "AES256", "ContentType": "text/csv"},
        )
        print(f"Uploaded {path} -> s3://{bucket}/{key} (bucket remains private; SSE-S3 enabled on the object).")
    except Exception as exc:  # noqa: BLE001
        print(classify_io_error(exc), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
