const logger = require('../config/logger');

const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    // Check if response has already been sent
    if (res.headersSent) {
      logger.error('Headers already sent when error occurred:', err);
      return;
    }

    // Only pass error to next if headers haven't been sent
    next(err);
  });
};

module.exports = catchAsync;
