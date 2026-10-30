import sys
from pathlib import Path

import pytest

ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE_DIR))

from jobs.cleaning import clean, read_raw  # noqa: E402
from jobs.session import build_spark  # noqa: E402

TEST_CSV = Path(__file__).resolve().parent / "test_orders.csv"


@pytest.fixture(scope="session")
def spark():
    session = build_spark("EcommerceSalesTests", log_level="ERROR")
    yield session
    session.stop()


@pytest.fixture(scope="session")
def cleaned(spark):
    return clean(read_raw(spark, TEST_CSV))  # (clean_df, quality)
