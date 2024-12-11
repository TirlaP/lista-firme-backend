const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const httpStatus = require('http-status');
const config = require('./config/config');
const morgan = require('./config/morgan');
const { jwtStrategy } = require('./config/passport');
const { authLimiter } = require('./middlewares/rateLimiter');
const routes = require('./routes/v1');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');

const app = express();

// Initialize middleware
if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// Set security HTTP headers
app.use(helmet());

// Parse json request body
app.use(express.json({ limit: '50kb' }));

// Parse urlencoded request body
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// Sanitize request data
app.use(xss());

// GZIP compression
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6, // Balanced between speed and compression ratio
  })
);

// Enable CORS
app.use(cors());
app.options('*', cors());

// Add response time header
app.use((req, res, next) => {
  res._startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - res._startTime;
    res.setHeader('X-Response-Time', `${duration}ms`);
  });
  next();
});

// Cache control headers
app.use((req, res, next) => {
  // Cache static resources longer
  if (req.url.startsWith('/static')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
});

// JWT authentication
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

// Limit repeated failed requests to auth endpoints
if (config.env === 'production') {
  app.use('/v1/auth', authLimiter);
}

// API routes
app.use('/v1', routes);

// Send back a 404 error for any unknown api request
app.use((req, res, next) => {
  if (res.headersSent) {
    return;
  }
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

// Convert error to ApiError, if needed
app.use(errorConverter);

// Handle error
app.use(errorHandler);

// Add server timing headers
app.use((req, res, next) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const time = diff[0] * 1e3 + diff[1] * 1e-6;
    res.setHeader('Server-Timing', `total;dur=${time}`);
  });

  next();
});

module.exports = app;
