"""S3 live checks. Skipped unless S3_INTEGRATION_TEST=1 and S3_BUCKET is set."""
import os

import pytest

from jobs.storage import StorageConfigError, data_source, resolve_input

pytestmark = pytest.mark.skipif(
    os.environ.get("S3_INTEGRATION_TEST") != "1",
    reason="Set S3_INTEGRATION_TEST=1 with a real private bucket to run S3 checks",
)


def test_s3_cli_can_reach_bucket():
    from jobs.s3_io import check_access

    info = check_access()
    assert info["ok"] is True
    assert info["bucket"]
    assert "AWS_SECRET" not in str(info)


def test_resolve_input_is_s3a_when_configured():
    os.environ.setdefault("DATA_SOURCE", "s3")
    if not os.environ.get("S3_BUCKET"):
        raise StorageConfigError("S3_BUCKET required for integration test")
    assert data_source() == "s3"
    assert resolve_input().startswith("s3a://")
