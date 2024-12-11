// src/services/redis.service.js
const Redis = require('ioredis');
const config = require('../config/config');

class RedisService {
  constructor() {
    this.client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.client.on('error', (err) => console.error('Redis error:', err));
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 300) {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  }

  async setHash(key, field, value, ttl = 300) {
    try {
      await this.client.hset(key, field, JSON.stringify(value));
      await this.client.expire(key, ttl);
    } catch (error) {
      console.error('Redis hash set error:', error);
    }
  }

  async getHash(key, field) {
    try {
      const value = await this.client.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis hash get error:', error);
      return null;
    }
  }
}

module.exports = new RedisService();
