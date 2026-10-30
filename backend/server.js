const app = require('./app');
const config = require('./config');
const worker = require('./services/sparkWorker');
const store = require('./services/outputStore');
const { hydrateFromS3 } = require('./services/s3hydrate');

function logBoot() {
  console.log(`API listening on port ${config.port}`);
  console.log(`  Data source  : ${config.dataSource}`);
  console.log(`  Spark output : ${config.outputDir}`);
  console.log(`  Input        : ${config.inputCsv}`);
  console.log(`  Python       : ${config.pythonBin}`);
  if (config.inputCsvError) console.error(`  Config warning: ${config.inputCsvError}`);
}

function maybePrewarm() {
  if (config.prewarmWorker && store.readJson('analytics.json')) {
    console.log('  Spark worker : warming up in the background (first filtered query is ready in ~40s)');
    worker.start().catch((err) => console.error(`[worker] pre-warm failed: ${err.message}`));
  }
}

const server = app.listen(config.port, async () => {
  logBoot();
  if (config.s3.hydrateOnBoot) {
    try {
      const result = await hydrateFromS3();
      if (!result.skipped) {
        console.log(`  S3 hydrate   : ${(result.downloaded && result.downloaded.length) ? result.downloaded.join(', ') : 'no objects yet'}`);
      }
    } catch (err) {
      console.error(`[s3] hydrate failed: ${err.message}`);
    }
  }
  maybePrewarm();
});

function shutdown() {
  worker.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
