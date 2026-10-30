#!/usr/bin/env python3
"""Long-lived Spark worker used by the Node.js API for FILTERED requests.

One SparkSession is created at start-up, the CSV is cleaned once and cached, and then
JSON requests are answered over stdin/stdout (one JSON object per line):

    -> {"id": 1, "type": "analytics", "filters": {"start": "2025-01-01", "category": "Books"}}
    <- {"id": 1, "ok": true, "data": {...}}

stdout is reserved for the protocol; all logging goes to stderr.
"""
import argparse
import json
import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

PROTOCOL = sys.stdout
sys.stdout = sys.stderr  # stray prints must never corrupt the protocol channel

from jobs.aggregations import compute_analytics  # noqa: E402
from jobs.cleaning import clean, read_raw  # noqa: E402
from jobs.io_utils import _default  # noqa: E402
from jobs.session import build_spark  # noqa: E402
from jobs.storage import StorageConfigError, classify_io_error, is_remote, resolve_input  # noqa: E402


def send(message):
    PROTOCOL.write(json.dumps(message, default=_default) + "\n")
    PROTOCOL.flush()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=None)
    args = parser.parse_args()

    try:
        input_uri = resolve_input(args.input)
        if not is_remote(input_uri) and not Path(input_uri).is_file():
            raise FileNotFoundError(f"Input CSV not found: {input_uri}")
        spark = build_spark("EcommerceSalesWorker", input_uri=input_uri)
        clean_df, _ = clean(read_raw(spark, input_uri))
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        message = str(exc) if isinstance(exc, StorageConfigError) else classify_io_error(exc)
        send({"type": "fatal", "error": message})
        sys.exit(1)

    send({"type": "ready", "spark_version": spark.version, "input": input_uri})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            kind = request.get("type")
            if kind == "shutdown":
                break
            if kind == "ping":
                send({"id": request_id, "ok": True, "data": "pong"})
            elif kind == "analytics":
                send({"id": request_id, "ok": True,
                      "data": compute_analytics(spark, clean_df, request.get("filters"))})
            else:
                send({"id": request_id, "ok": False, "error": f"Unknown request type: {kind}"})
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            send({"id": request_id, "ok": False, "error": f"{type(exc).__name__}: {exc}"})

    spark.stop()


if __name__ == "__main__":
    main()
