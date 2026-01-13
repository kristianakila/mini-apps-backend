require('dotenv').config();

const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiVersion: process.env.API_VERSION || 'v1',
  
  // Firebase
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  },
  
  // Redis
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD,
    ttl: parseInt(process.env.REDIS_TTL, 10) || 3600,
  },
  
  // Cache
  cache: {
    memoryTTL: parseInt(process.env.MEMORY_CACHE_TTL, 10) || 300,
    configTTL: parseInt(process.env.CONFIG_CACHE_TTL, 10) || 600,
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },
  
  // Security
  security: {
    apiKeyHeader: process.env.API_KEY_HEADER || 'X-API-Key',
    botIdHeader: process.env.BOT_ID_HEADER || 'X-Bot-ID',
    allowedDomains: process.env.ALLOWED_DOMAINS?.split(',') || [],
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
};

// Validation
const requiredFields = ['FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL'];
requiredFields.forEach(field => {
  if (!process.env[field]) {
    console.warn(`Warning: ${field} is not set in environment variables`);
  }
});

module.exports = config;
