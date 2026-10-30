const express = require('express');
const cors = require('cors');
const config = require('./config');
const routes = require('./routes');
const { AppError } = require('./errors');

const app = express();

app.use(cors({ origin: config.corsOrigins, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());
app.use('/api', routes);

app.use('/api', (req, res, next) => next(new AppError(404, 'NOT_FOUND', `No such endpoint: ${req.method} ${req.originalUrl}`)));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(`[error] ${err.code || ''} ${err.message}`);
  res.status(status).json({
    success: false,
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Unexpected server error.' },
  });
});

module.exports = app;
