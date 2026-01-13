const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

let redisClient;

if (config.redis.enabled) {
  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  });
}

/**
 * Общий rate limiter для API
 */
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Пропускаем health check
    return req.path === '/health' || req.path === '/api/health';
  },
  ...(config.redis.enabled && redisClient && {
    store: new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
    }),
  }),
});

/**
 * Rate limiter по botId
 */
const perBotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 1000, // 1000 запросов на бота за 15 минут
  keyGenerator: (req) => {
    return req.botContext?.botId || req.ip;
  },
  message: {
    success: false,
    error: {
      code: 'BOT_RATE_LIMIT_EXCEEDED',
      message: 'Too many requests for this bot, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter для спина колеса
 */
const spinLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 10, // 10 спинов в минуту
  keyGenerator: (req) => {
    const userId = req.user?.id || req.body?.userId || req.query?.userId;
    return `${req.botContext?.botId}:${userId || req.ip}`;
  },
  message: {
    success: false,
    error: {
      code: 'SPIN_LIMIT_EXCEEDED',
      message: 'Too many spin attempts, please wait a moment',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  globalLimiter,
  perBotLimiter,
  spinLimiter,
};
