const fs = require('fs');
const path = require('path');
const config = require('../config');

const cache = new Map(); // file -> { mtimeMs, data }

/** Read a JSON file written by the Spark batch job. Returns null when it does not exist. */
function readJson(name) {
  const file = path.join(config.outputDir, name);
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.data;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  cache.set(file, { mtimeMs: stat.mtimeMs, data });
  return data;
}

function writeStatus(payload) {
  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.writeFileSync(path.join(config.outputDir, 'status.json'), JSON.stringify(payload, null, 2));
}

module.exports = { readJson, writeStatus };
