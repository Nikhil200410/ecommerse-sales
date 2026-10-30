"""Upload / download analytics JSON with boto3 (instance profile or default chain).

Spark still reads the CSV through Hadoop S3A. These helpers only move the small
JSON reports that Express serves, so we do not start a Spark session just to
copy a few kilobytes.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .storage import (
    RESULT_FILES,
    StorageConfigError,
    aws_region,
    classify_io_error,
    env,
    require_bucket,
    result_key,
    s3_input_key,
    s3_writes_enabled,
)

try:
    import boto3
    from botocore.config import Config as BotoConfig
    from botocore.exceptions import BotoCoreError, ClientError
except ImportError:  # pragma: no cover - exercised when boto3 is not installed
    boto3 = None
    BotoConfig = None
    BotoCoreError = ClientError = Exception


def _client():
    if boto3 is None:
        raise StorageConfigError(
            "boto3 is required for S3 JSON upload/download. "
            "Install dependencies with: pip install -r spark-engine/requirements.txt"
        )
    return boto3.client(
        "s3",
        region_name=aws_region(),
        config=BotoConfig(
            connect_timeout=10,
            read_timeout=60,
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def upload_json(payload, filename: str):
    bucket = require_bucket()
    key = result_key(filename)
    body = json.dumps(payload, indent=2, default=str).encode("utf-8")
    _client().put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType="application/json",
        ServerSideEncryption="AES256",
    )
    return f"s3://{bucket}/{key}"


def maybe_upload_results(output_dir: Path, extra=None):
    """Copy known result files (and optional extra names) from the local output dir to S3."""
    if not s3_writes_enabled():
        return []
    uploaded = []
    names = list(RESULT_FILES)
    if extra:
        names.extend(extra)
    seen = set()
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        path = Path(output_dir) / name
        if not path.is_file():
            continue
        with open(path, "rb") as fh:
            body = fh.read()
        bucket = require_bucket()
        key = result_key(name)
        _client().put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ContentType="application/json" if name.endswith(".json") else "text/csv; charset=utf-8",
            ServerSideEncryption="AES256",
        )
        uploaded.append(f"s3://{bucket}/{key}")
    return uploaded


def download_results(output_dir: Path):
    """Pull the latest JSON reports from S3 into the local output directory."""
    bucket = require_bucket()
    client = _client()
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    downloaded = []
    for name in RESULT_FILES:
        key = result_key(name)
        dest = output_dir / name
        try:
            obj = client.get_object(Bucket=bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("NoSuchKey", "404", "NotFound"):
                continue
            raise
        dest.write_bytes(obj["Body"].read())
        downloaded.append(name)
    return downloaded


def check_access():
    """Head the bucket and optional input object. Returns a dict; never includes secrets."""
    bucket = require_bucket()
    client = _client()
    client.head_bucket(Bucket=bucket)
    input_key = s3_input_key()
    input_ok = False
    input_error = None
    try:
        client.head_object(Bucket=bucket, Key=input_key)
        input_ok = True
    except ClientError as exc:
        input_error = exc.response.get("Error", {}).get("Code", type(exc).__name__)
    return {
        "ok": True,
        "bucket": bucket,
        "region": aws_region(),
        "input_key": input_key,
        "input_object_found": input_ok,
        "input_object_error": input_error,
        "output_prefix": env("S3_OUTPUT_PREFIX", "processed"),
    }


def main():
    parser = argparse.ArgumentParser(description="S3 helpers for e-commerce analytics JSON")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check", help="verify bucket access and whether the dataset object exists")
    pull = sub.add_parser("hydrate", help="download processed JSON from S3 into OUTPUT_DIR")
    pull.add_argument("--output", default=env("OUTPUT_DIR") or str(Path(__file__).resolve().parents[2] / "output"))
    push = sub.add_parser("upload-results", help="upload local OUTPUT_DIR JSON to S3")
    push.add_argument("--output", default=env("OUTPUT_DIR") or str(Path(__file__).resolve().parents[2] / "output"))
    args = parser.parse_args()
    try:
        if args.command == "check":
            info = check_access()
            print(json.dumps(info, indent=2))
            if not info["input_object_found"]:
                print(
                    f"Bucket is reachable but s3://{info['bucket']}/{info['input_key']} was not found "
                    f"({info['input_object_error']}). Upload the CSV before running Spark with DATA_SOURCE=s3.",
                    file=sys.stderr,
                )
                sys.exit(2)
            return
        if args.command == "hydrate":
            files = download_results(Path(args.output))
            print(json.dumps({"ok": True, "downloaded": files, "output": str(Path(args.output))}))
            return
        if args.command == "upload-results":
            files = maybe_upload_results(Path(args.output))
            print(json.dumps({"ok": True, "uploaded": files}))
            return
    except (StorageConfigError, BotoCoreError, ClientError, OSError) as exc:
        print(classify_io_error(exc), file=sys.stderr)
        sys.exit(1)


