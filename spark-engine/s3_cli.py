#!/usr/bin/env python3
"""CLI: python s3_cli.py check | hydrate | upload-results"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from jobs.s3_io import main  # noqa: E402

if __name__ == "__main__":
    main()
