"""SparkSession factory (local mode, tuned for a student laptop / single EC2 instance)."""
import os
import sys

from pyspark.sql import SparkSession

from .storage import aws_region, data_source, env, is_remote


def _hadoop_aws_packages():
    """Match hadoop-aws to the Hadoop version shipped with the installed PySpark.

    Spark 4.x → Hadoop 3.4.x (AWS SDK v2, pulled transitively).
    Spark 3.5.x → Hadoop 3.3.4 + aws-java-sdk-bundle 1.12.262 (do not mix these).
    Override with SPARK_HADOOP_AWS_PACKAGES or provide local JARs via SPARK_HADOOP_AWS_JARS.
    """
    override = env("SPARK_HADOOP_AWS_PACKAGES")
    if override:
        return override
    try:
        import pyspark
        major = int(pyspark.__version__.split(".", 1)[0])
    except Exception:  # noqa: BLE001
        major = 4
    if major >= 4:
        return "org.apache.hadoop:hadoop-aws:3.4.1"
    return "org.apache.hadoop:hadoop-aws:3.3.4,com.amazonaws:aws-java-sdk-bundle:1.12.262"


def _needs_s3(input_uri=None) -> bool:
    flag = env("SPARK_ENABLE_S3").lower()
    if flag in ("1", "true", "yes"):
        return True
    if flag in ("0", "false", "no"):
        return False
    if input_uri and is_remote(input_uri):
        return True
    return data_source() == "s3"


def build_spark(app_name="EcommerceSalesAnalytics", log_level="WARN", input_uri=None):
    # Make sure Spark's Python workers use the same interpreter as this process.
    os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
    os.environ.setdefault("PYSPARK_DRIVER_PYTHON", sys.executable)

    builder = (
        SparkSession.builder.master(env("SPARK_MASTER", "local[*]"))
        .appName(app_name)
        .config("spark.ui.enabled", "false")
        .config("spark.sql.shuffle.partitions", env("SPARK_SHUFFLE_PARTITIONS", "8"))
        # ANSI off: invalid casts/dates become NULL (which we validate) instead of raising.
        .config("spark.sql.ansi.enabled", "false")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.driver.memory", env("SPARK_DRIVER_MEMORY", "2g"))
        .config("spark.driver.bindAddress", env("SPARK_DRIVER_BIND_ADDRESS", "127.0.0.1"))
        .config("spark.driver.host", env("SPARK_DRIVER_HOST", "127.0.0.1"))
    )

    if _needs_s3(input_uri):
        region = aws_region()
        jars = env("SPARK_HADOOP_AWS_JARS")
        if jars:
            builder = builder.config("spark.jars", jars)
        else:
            builder = builder.config("spark.jars.packages", _hadoop_aws_packages())
        builder = (
            builder.config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
            .config("spark.hadoop.fs.s3a.endpoint.region", region)
            .config("spark.hadoop.fs.s3a.endpoint", f"s3.{region}.amazonaws.com")
            .config("spark.hadoop.fs.s3a.path.style.access", "false")
            .config("spark.hadoop.fs.s3a.connection.timeout", "20000")
            .config("spark.hadoop.fs.s3a.attempts.maximum", "4")
            .config("spark.hadoop.fs.s3a.fast.upload", "true")
        )
        # Default S3A credential chain (env, profile, EC2 instance profile). Never set access keys here.
        provider = env("SPARK_S3A_CREDENTIALS_PROVIDER")
        if provider:
            builder = builder.config("spark.hadoop.fs.s3a.aws.credentials.provider", provider)
        print(
            f"[spark] S3A enabled (region={region}, packages={jars or _hadoop_aws_packages()}). "
            "Credentials come from the default AWS chain (instance profile / env / shared config).",
            file=sys.stderr,
        )

    spark = builder.getOrCreate()
    spark.sparkContext.setLogLevel(log_level)
    return spark
