# AWS Integration Status

Audit date: 2026-10-25. This workspace has no `.git` directory, so prior changes cannot be attributed or compared to history.

## Completion checklist

| Area | Status | Evidence / remaining check |
|---|---|---|
| Existing Spark SQL functionality | Completed and verified | PySpark cleaning and actual `spark.sql()` aggregations passed the local Spark suite: 17 passed. |
| S3 dataset storage | Partially implemented | `upload_dataset.py` and configurable bucket/key exist; bucket creation/privacy and upload require AWS-side setup. |
| Reading datasets from S3 | Implemented but not verified | S3A URI resolution and version-aware Hadoop AWS coordinates exist; no live S3 read tested. |
| Writing processed analytics to S3 | Implemented but not verified | Batch JSON/CSV reports are copied with boto3; no live S3 write tested. |
| Backend integration | Completed and verified locally | Express/API tests passed 9/9, including Spark batch and filtered-worker paths. AWS hydration was not exercised. |
| Frontend API configuration | Completed and verified locally | Production build passed with the configured relative `/api` path and Vite proxy; Vite reported a non-failing large-chunk warning. |
| Local development support | Completed and verified locally | Local CSV pipeline and Spark-backed API paths passed their tests without AWS credentials. |
| AWS security and IAM configuration | Partially implemented | Runtime policy is read-only on `raw/*`; separate publisher policy grants scoped upload access. JSON/prefix scope was checked, but policies are not deployed and bucket privacy is not remotely verified. |
| EC2 deployment preparation | Implemented but not verified | Setup script, systemd unit, nginx example, IAM policies, and single-instance guide exist; no EC2 deployment performed. |
| Testing and documentation | Partially implemented | Local Spark, backend, and frontend checks passed. Live AWS tests and deployment instructions still require execution in an AWS account. |

## Priority tasks

1. Apply the least-privilege runtime and separate publisher IAM policies to AWS roles.
2. Create/configure a private S3 bucket and validate upload, S3A read, and processed-results write using the instance profile.
3. Deploy to EC2 and execute the documented service/API checks; deployment has not occurred from this workspace.

## Audit notes

- Dataset: generated synthetic CSV at `spark-engine/data/orders.csv` (12,829,223 bytes, 13-column header); generated local reports are in `output/`.
- Runtime observed: Python 3.11.9, Java 17.0.15, Node 22.16.0; project venv and both npm dependency trees are present.
- PySpark dependency is pinned to 4.0.1; S3A selects Hadoop AWS 3.4.1 for Spark 4 and Hadoop AWS 3.3.4 plus AWS SDK bundle 1.12.262 for Spark 3.5.
- No AWS credentials, bucket, or EC2 instance have been established or tested by this audit.

## Work log

- Files updated during this continuation: `AWS_INTEGRATION_STATUS.md`, `deploy/iam-s3-policy.json`, and `deploy/iam-s3-publisher-policy.json`. The workspace has no Git metadata, so prior-vs-current ownership cannot be independently diffed.
- IAM policy correction completed: EC2 runtime access does not write to `raw/*`; one-time publishing has a separate scoped policy.
- Verified locally: `\.venv\Scripts\python.exe -m pytest spark-engine\tests -q` -> 17 passed, 2 skipped (optional live-S3 tests).
- Verified locally: backend integration tests -> 9 passed, including Spark batch and filtered-worker requests.
- Verified locally: frontend production build succeeded; Vite emitted a non-failing large-chunk warning.
- `python-dotenv` was already installed in `.venv`; no dependency or lockfile change was needed during this continuation.
- Not tested: AWS S3 connectivity/permissions and EC2 deployment. No AWS credentials, bucket, or instance were available.
- No `.git` directory is present, so repository diff/history cannot be used to attribute earlier implementation changes.