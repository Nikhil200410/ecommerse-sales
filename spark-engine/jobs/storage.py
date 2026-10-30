"""Resolve local vs S3 dataset/output locations from environment variables.

Spark reads the CSV through s3a:// when DATA_SOURCE=s3 (or ANALYTICS_INPUT is already
an s3/s3a URI). JSON reports stay on local disk for the Express API and are also
copied to S3 when S3 writes are enabled.

Credentials are never read from this module: boto3 and Hadoop S3A use the default
AWS chain (environment, shared config, EC2 instance profile).
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent.parent
DEFAULT_LOCAL_INPUT = HERE / "data" / "orders.csv"
DEFAULT_LOCAL_OUTPUT = HERE.parent / "output"

RESULT_FILES = ("analytics.json", "data_quality.json", "meta.json", "status.json")


def load_project_env(env_file=None):
    """Load root .env for standalone Python commands without overriding shell values."""
    load_dotenv(str(env_file or HERE.parent / ".env"), override=False)


load_project_env()


class StorageConfigError(ValueError):
    """Invalid S3 / path configuration (missing bucket, bad URI, etc.)."""


def env(name, default=""):
    value = os.environ.get(name)
    return default if value is None or str(value).strip() == "" else str(value).strip()


def is_remote(uri) -> bool:
    text = str(uri).strip()
    return text.startswith("s3a://") or text.startswith("s3://")


def to_s3a(uri: str) -> str:
    text = str(uri).strip()
    if text.startswith("s3://"):
        return "s3a://" + text[5:]
    return text


def data_source() -> str:
    explicit = env("DATA_SOURCE").lower()
    if explicit in ("s3", "local"):
        return explicit
    if is_remote(env("ANALYTICS_INPUT")):
        return "s3"
    return "local"


def aws_region() -> str:
    return env("AWS_REGION") or env("AWS_DEFAULT_REGION") or env("S3_REGION") or "ap-south-1"


def s3_bucket() -> str:
    return env("S3_BUCKET")


def s3_input_key() -> str:
    return env("S3_INPUT_KEY", "raw/orders.csv").lstrip("/")


def s3_output_prefix() -> str:
    return env("S3_OUTPUT_PREFIX", "processed").strip("/")


def s3_writes_enabled() -> bool:
    flag = env("S3_WRITE_RESULTS").lower()
    if flag in ("0", "false", "no", "off"):
        return False
    if flag in ("1", "true", "yes", "on"):
        return True
    return data_source() == "s3"


def require_bucket():
    bucket = s3_bucket()
    if not bucket:
        raise StorageConfigError(
            "S3 is enabled but S3_BUCKET is not set. "
            "Set S3_BUCKET and AWS_REGION, or set DATA_SOURCE=local to use the local CSV."
        )
    if bucket.startswith("s3://") or bucket.startswith("s3a://") or "/" in bucket:
        raise StorageConfigError(
            f"S3_BUCKET must be the bucket name only (no s3:// prefix or key). Got: {bucket}"
        )
    return bucket


def resolve_input(cli_value=None) -> str:
    """Return a local filesystem path or an s3a:// URI for Spark to read."""
    raw = (str(cli_value).strip() if cli_value else "") or env("ANALYTICS_INPUT")
    if raw and is_remote(raw):
        return to_s3a(raw)
    if data_source() == "s3":
        bucket = require_bucket()
        if raw and not is_remote(raw) and env("ANALYTICS_INPUT"):
            # ANALYTICS_INPUT was a local path while DATA_SOURCE=s3: prefer the S3 key.
            pass
        return f"s3a://{bucket}/{s3_input_key()}"
    if raw:
        return str(Path(raw).expanduser())
    return str(DEFAULT_LOCAL_INPUT)


def resolve_output_dir(cli_value=None) -> Path:
    raw = (str(cli_value).strip() if cli_value else "") or env("OUTPUT_DIR")
    if raw and is_remote(raw):
        raise StorageConfigError(
            "OUTPUT_DIR must be a local directory (the API reads JSON from disk). "
            "Use S3_WRITE_RESULTS=true and S3_OUTPUT_PREFIX to copy reports to S3."
        )
    return Path(raw).expanduser() if raw else DEFAULT_LOCAL_OUTPUT


def s3_object_uri(key: str) -> str:
    bucket = require_bucket()
    return f"s3a://{bucket}/{key.lstrip('/')}"


def result_key(filename: str) -> str:
    return f"{s3_output_prefix()}/{filename}"


def source_label(input_uri: str) -> str:
    if is_remote(input_uri):
        return input_uri.rstrip("/").rsplit("/", 1)[-1]
    return Path(input_uri).name


def classify_io_error(exc: BaseException) -> str:
    """Turn Hadoop / boto3 / network exceptions into an operator-facing message."""
    text = f"{type(exc).__name__}: {exc}"
    lower = text.lower()
    if isinstance(exc, FileNotFoundError) or "filenotfound" in lower or "no such file" in lower:
        return (
            f"{text}. For local mode run `python spark-engine/generate_data.py`. "
            "For S3, check S3_BUCKET and S3_INPUT_KEY."
        )
    if "nosuchbucket" in lower or "no such bucket" in lower:
        return f"S3 bucket not found. Check S3_BUCKET and AWS_REGION. ({text})"
    if "nosuchkey" in lower or "not found" in lower and "s3" in lower:
        return f"S3 object not found. Check S3_INPUT_KEY / S3_OUTPUT_PREFIX. ({text})"
    if "accessdenied" in lower or "access denied" in lower or "403" in lower or "forbidden" in lower:
        return (
            "S3 access denied. On EC2 attach an IAM instance profile with GetObject/PutObject "
            f"on this bucket; locally use `aws configure` or AWS_* environment variables. ({text})"
        )
    if "unable to locate credentials" in lower or "no credentials" in lower or "credential" in lower and "not found" in lower:
        return (
            "No AWS credentials found. Do not hardcode keys. Use an EC2 instance profile, "
            f"`aws configure`, or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in the environment. ({text})"
        )
    if "could not connect" in lower or "timed out" in lower or "timeout" in lower or "endpoint" in lower and "s3" in lower:
        return f"Could not reach Amazon S3 (network, region, or endpoint). Check AWS_REGION and connectivity. ({text})"
    if "invalidaccesskeyid" in lower or "signaturedoesnotmatch" in lower:
        return f"AWS credentials were rejected. Check the access key, secret, and region. ({text})"
    return text
