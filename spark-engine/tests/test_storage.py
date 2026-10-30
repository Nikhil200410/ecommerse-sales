"""Unit tests for local vs S3 path resolution. Does not contact AWS."""
import os

import pytest

from jobs.storage import (
    StorageConfigError,
    classify_io_error,
    data_source,
    is_remote,
    load_project_env,
    resolve_input,
    resolve_output_dir,
    s3_writes_enabled,
    to_s3a,
)


@pytest.fixture
def clean_env(monkeypatch):
    for key in (
        "DATA_SOURCE", "ANALYTICS_INPUT", "S3_BUCKET", "S3_INPUT_KEY",
        "S3_OUTPUT_PREFIX", "S3_WRITE_RESULTS", "OUTPUT_DIR", "AWS_REGION",
    ):
        monkeypatch.delenv(key, raising=False)
    return monkeypatch


def test_is_remote_and_to_s3a():
    assert is_remote("s3://bucket/raw/orders.csv")
    assert is_remote("s3a://bucket/raw/orders.csv")
    assert not is_remote("spark-engine/data/orders.csv")
    assert to_s3a("s3://b/k") == "s3a://b/k"
    assert to_s3a("s3a://b/k") == "s3a://b/k"


def test_default_is_local_csv(clean_env):
    assert data_source() == "local"
    uri = resolve_input()
    assert not is_remote(uri)
    assert uri.replace("\\", "/").endswith("spark-engine/data/orders.csv")
    assert not s3_writes_enabled()


def test_project_env_loads_without_overriding_shell_values(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "AWS_INTEGRATION_TEST_VALUE=from-file\nAWS_REGION=from-file\n",
        encoding="utf-8",
    )
    monkeypatch.delenv("AWS_INTEGRATION_TEST_VALUE", raising=False)
    monkeypatch.setenv("AWS_REGION", "from-shell")

    load_project_env(env_file)

    assert os.environ["AWS_INTEGRATION_TEST_VALUE"] == "from-file"
    assert os.environ["AWS_REGION"] == "from-shell"


def test_data_source_s3_builds_s3a_uri(clean_env):
    clean_env.setenv("DATA_SOURCE", "s3")
    clean_env.setenv("S3_BUCKET", "my-analytics-bucket")
    clean_env.setenv("S3_INPUT_KEY", "raw/orders.csv")
    assert data_source() == "s3"
    assert resolve_input() == "s3a://my-analytics-bucket/raw/orders.csv"
    assert s3_writes_enabled() is True


def test_s3_without_bucket_fails_fast(clean_env):
    clean_env.setenv("DATA_SOURCE", "s3")
    with pytest.raises(StorageConfigError, match="S3_BUCKET"):
        resolve_input()


def test_bucket_must_be_name_only(clean_env):
    clean_env.setenv("DATA_SOURCE", "s3")
    clean_env.setenv("S3_BUCKET", "s3://not-a-name/key")
    with pytest.raises(StorageConfigError, match="bucket name only"):
        resolve_input()


def test_explicit_s3a_input_even_in_local_mode(clean_env):
    clean_env.setenv("DATA_SOURCE", "local")
    clean_env.setenv("ANALYTICS_INPUT", "s3://other-bucket/data/orders.csv")
    assert resolve_input() == "s3a://other-bucket/data/orders.csv"


def test_s3_write_can_be_disabled(clean_env):
    clean_env.setenv("DATA_SOURCE", "s3")
    clean_env.setenv("S3_BUCKET", "b")
    clean_env.setenv("S3_WRITE_RESULTS", "false")
    assert s3_writes_enabled() is False


def test_output_dir_rejects_s3_uri(clean_env):
    with pytest.raises(StorageConfigError, match="local directory"):
        resolve_output_dir("s3://bucket/processed")


def test_classify_missing_file_and_access_denied():
    msg = classify_io_error(FileNotFoundError("missing.csv"))
    assert "generate_data.py" in msg
    class Fake(Exception):
        pass
    denied = classify_io_error(Fake("AccessDenied: User is not authorized"))
    assert "instance profile" in denied.lower()
