"""Small helpers for writing JSON atomically and converting Spark rows."""
import datetime as dt
import decimal
import json
import os
from pathlib import Path


def _default(value):
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    raise TypeError(f"Cannot serialise {type(value)}")


def write_json_atomic(path, payload):
    """Write JSON to a temp file and rename, so the API never reads a half-written file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, default=_default, indent=2)
    os.replace(tmp, path)


def rows(df):
    """Collect a Spark DataFrame into a list of plain dicts (Decimal -> float, date -> ISO string)."""
    out = []
    for row in df.collect():
        record = {}
        for key, value in row.asDict().items():
            if isinstance(value, decimal.Decimal):
                value = float(value)
            elif isinstance(value, (dt.date, dt.datetime)):
                value = value.isoformat()
            record[key] = value
        out.append(record)
    return out


def first_row(df):
    result = rows(df)
    return result[0] if result else {}
