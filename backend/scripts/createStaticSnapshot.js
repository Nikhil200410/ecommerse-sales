const fs = require('fs');
const path = require('path');
const { DATASETS, toCsv } = require('../services/csvExport');

const projectRoot = path.resolve(__dirname, '..', '..');
const outputDir = path.join(projectRoot, 'output');
const dataDir = path.join(projectRoot, 'frontend', 'public', 'data');

function readOutput(name) {
  const file = path.join(outputDir, name);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}. Run the local Spark batch job first.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const status = readOutput('status.json');
if (status.state !== 'succeeded') {
  throw new Error(`Spark job did not succeed (state: ${status.state || 'unknown'}).`);
}

const analytics = readOutput('analytics.json');
fs.mkdirSync(path.join(dataDir, 'exports'), { recursive: true });

for (const name of ['analytics.json', 'data_quality.json', 'meta.json']) {
  fs.copyFileSync(path.join(outputDir, name), path.join(dataDir, name));
}

for (const name of Object.keys(DATASETS)) {
  fs.writeFileSync(path.join(dataDir, 'exports', `${name}.csv`), toCsv(name, analytics), 'utf8');
}

console.log(`Created static dashboard data in ${dataDir}`);
