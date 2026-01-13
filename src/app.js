const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/error-handler');
const corsMiddleware = require('./middleware/cors');

// Инициализация Firebase
require('./config/firebase').initializeFirebase();

const app = express();

// Request ID middleware
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || require('crypto').randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Безопасность
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://firestore.googleapis.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(corsMiddleware);

// Парсинг тела запроса
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Gzip компрессия
app.use(compression());

// Логирование запросов
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      botId: req.botContext?.botId || 'unknown',
      requestId: req.id,
    });
  });
  
  next();
});

// API Routes
const apiRouter = require('./routes/api');
app.use(`/api/${config.apiVersion}`, apiRouter);

// Корневой маршрут
app.get('/', (req, res) => {
  res.json({
    service: 'Telegram Mini Apps Backend',
    version: '1.0.0',
    status: 'operational',
    documentation: '/api-docs', // TODO: Добавить документацию
    endpoints: {
      health: '/health',
      botConfig: `/api/${config.apiVersion}/bot-config`,
      user: `/api/${config.apiVersion}/user`,
      wheel: `/api/${config.apiVersion}/wheel`,
    },
    timestamp: new Date().toISOString(),
  });
});

// 404 обработчик
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.url} not found`,
    },
    requestId: req.id,
    timestamp: new Date().toISOString(),
  });
});

// Глобальный обработчик ошибок
app.use(errorHandler);

module.exports = app;
