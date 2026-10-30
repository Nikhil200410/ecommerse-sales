const express = require('express');
const c = require('../controllers/analyticsController');
const config = require('../config');

const router = express.Router();
// Express 4 does not catch rejected promises, so wrap async handlers.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/health', (req, res) => res.json({
  success: true,
  data: {
    status: 'ok',
    data_source: config.dataSource,
    s3_enabled: Boolean(config.s3.bucket && config.dataSource === 's3'),
  },
  meta: {},
}));
router.get('/status', h(c.status));
router.post('/jobs/run', h(c.runJob));
router.get('/filters', h(c.filterOptions));
router.get('/overview', h(c.overview));
router.get('/trends', h(c.trends));
router.get('/products', h(c.products));
router.get('/customers', h(c.customers));
router.get('/geography', h(c.geography));
router.get('/payments', h(c.payments));
router.get('/data-quality', h(c.dataQuality));
router.get('/export/:dataset', h(c.exportCsv));

module.exports = router;
