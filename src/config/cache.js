const NodeCache = require('node-cache');
const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

class CacheManager {
  constructor() {
    this.memoryCache = new NodeCache({ 
      stdTTL: config.cache.memoryTTL,
      checkperiod: 60 
    });
    
    this.redisClient = null;
    this.useRedis = config.redis.enabled;
    
    if (this.useRedis) {
      this.initializeRedis();
    }
  }
  
  initializeRedis() {
    try {
      this.redisClient = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });
      
      this.redisClient.on('connect', () => {
        logger.info('Redis connected successfully');
      });
      
      this.redisClient.on('error', (error) => {
        logger.error('Redis connection error:', error);
        this.useRedis = false;
      });
      
    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      this.useRedis = false;
    }
  }
  
  async get(key) {
    try {
      // Try Redis first if enabled
      if (this.useRedis && this.redisClient) {
        const value = await this.redisClient.get(key);
        if (value) {
          return JSON.parse(value);
        }
      }
      
      // Fallback to memory cache
      return this.memoryCache.get(key);
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }
  
  async set(key, value, ttl = null) {
    try {
      const ttlSeconds = ttl || config.cache.configTTL;
      
      // Set in memory cache
      this.memoryCache.set(key, value, ttlSeconds);
      
      // Set in Redis if enabled
      if (this.useRedis && this.redisClient) {
        await this.redisClient.setex(
          key,
          ttlSeconds,
          JSON.stringify(value)
        );
      }
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  }
  
  async del(key) {
    try {
      this.memoryCache.del(key);
      
      if (this.useRedis && this.redisClient) {
        await this.redisClient.del(key);
      }
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
    }
  }
  
  async getOrSet(key, fetchFn, ttl = null) {
    const cached = await this.get(key);
    if (cached !== undefined && cached !== null) {
      return cached;
    }
    
    const value = await fetchFn();
    await this.set(key, value, ttl);
    return value;
  }
  
  async clearByPattern(pattern) {
    try {
      // Clear memory cache
      const keys = this.memoryCache.keys();
      keys.forEach(key => {
        if (key.includes(pattern)) {
          this.memoryCache.del(key);
        }
      });
      
      // Clear Redis
      if (this.useRedis && this.redisClient) {
        const redisKeys = await this.redisClient.keys(`*${pattern}*`);
        if (redisKeys.length > 0) {
          await this.redisClient.del(...redisKeys);
        }
      }
    } catch (error) {
      logger.error(`Cache clear pattern error for ${pattern}:`, error);
    }
  }
}

module.exports = new CacheManager();
