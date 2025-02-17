const NodeCache = require('node-cache');
const logger = require('../config/logger');

class CacheService {
  constructor() {
    this.mainCache = new NodeCache({
      stdTTL: 300, // 5 minutes
      checkperiod: 60,
      maxKeys: 10000,
      deleteOnExpire: true,
    });

    this.prefetchCache = new NodeCache({
      stdTTL: 600, // 10 minutes
      checkperiod: 120,
      maxKeys: 50000,
    });

    // Track ongoing prefetch operations
    this.prefetchOperations = new Set();
  }

  get(key, usePrefetchCache = false) {
    try {
      const mainResult = this.mainCache.get(key);
      if (mainResult) return mainResult;

      if (usePrefetchCache) {
        return this.prefetchCache.get(key);
      }
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  set(key, value, ttl = 300, usePrefetchCache = false) {
    try {
      const cache = usePrefetchCache ? this.prefetchCache : this.mainCache;
      return cache.set(key, value, ttl);
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  del(key, usePrefetchCache = false) {
    try {
      this.mainCache.del(key);
      if (usePrefetchCache) {
        this.prefetchCache.del(key);
      }
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  isPrefetching(key) {
    return this.prefetchOperations.has(key);
  }

  startPrefetch(key) {
    this.prefetchOperations.add(key);
  }

  endPrefetch(key) {
    this.prefetchOperations.delete(key);
  }

  promoteFromPrefetch(key) {
    const value = this.prefetchCache.get(key);
    if (value) {
      this.mainCache.set(key, value);
      this.prefetchCache.del(key);
    }
    return value;
  }

  async getOrSet(key, fetchFn, ttl = 300) {
    const cached = this.get(key);
    if (cached) return cached;

    const value = await fetchFn();
    this.set(key, value, ttl);
    return value;
  }
}

module.exports = new CacheService();
