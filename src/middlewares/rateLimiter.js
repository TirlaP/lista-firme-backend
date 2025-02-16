const rateLimit = require('express-rate-limit');

// Authentication rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  skipSuccessfulRequests: true,
  message: 'Too many failed attempts, please try again later',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Create a memory store for rate limiting
const MemoryStore = new Map();

const createSubscriptionBasedLimiter = (windowMs, defaultMax) => {
  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of MemoryStore.entries()) {
      if (now - value.timestamp > windowMs) {
        MemoryStore.delete(key);
      }
    }
  }, windowMs);

  return rateLimit({
    windowMs,
    max: async (req) => {
      if (!req.user) return defaultMax;

      // Get subscription from user object instead of service call
      const subscriptionPlan = req.user.subscriptionInfo?.currentPlan || 'free';

      // Adjust limits based on subscription plan
      const planLimits = {
        basic: defaultMax * 2,
        premium: defaultMax * 5,
        enterprise: defaultMax * 10,
      };

      return planLimits[subscriptionPlan] || defaultMax;
    },
    message: 'Rate limit exceeded, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    // Custom storage to handle async max function
    store: {
      async incr(key) {
        const now = Date.now();
        const record = MemoryStore.get(key) || { count: 0, timestamp: now };

        // Reset if window has passed
        if (now - record.timestamp > windowMs) {
          record.count = 0;
          record.timestamp = now;
        }

        record.count += 1;
        MemoryStore.set(key, record);
        return record.count;
      },
      async decrement(key) {
        const record = MemoryStore.get(key);
        if (record) {
          record.count = Math.max(0, record.count - 1);
          MemoryStore.set(key, record);
        }
      },
      async resetKey(key) {
        MemoryStore.delete(key);
      },
    },
  });
};

// Rate limiters for different endpoints
const apiLimiter = createSubscriptionBasedLimiter(60 * 1000, 30); // 30 requests per minute for free plan
const searchLimiter = createSubscriptionBasedLimiter(60 * 1000, 10); // 10 searches per minute for free plan
const exportLimiter = createSubscriptionBasedLimiter(60 * 60 * 1000, 2); // 2 exports per hour for free plan

module.exports = {
  authLimiter,
  apiLimiter,
  searchLimiter,
  exportLimiter,
};
