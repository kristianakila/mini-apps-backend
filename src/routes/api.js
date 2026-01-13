const express = require('express');
const router = express.Router();
const { botDetector, domainValidator } = require('../middleware/bot-detector');
const { 
  globalLimiter, 
  perBotLimiter, 
  spinLimiter 
} = require('../middleware/rate-limiter');
const { validate, validateSpin } = require('../middleware/validator');

// Контроллеры
const botConfigController = require('../controllers/bot-config');
const userController = require('../controllers/user');
const wheelController = require('../controllers/wheel');
const healthController = require('../controllers/health');

/**
 * Публичные маршруты (не требуют botId)
 */
router.get('/health', healthController.healthCheck);
router.get('/health/ready', healthController.readinessCheck);
router.get('/health/bots/:botId', healthController.botHealthCheck);

/**
 * Защищенные маршруты (требуют определения бота)
 */

// Глобальный rate limiter
router.use(globalLimiter);

// Middleware определения botId
router.use(botDetector);

// Per-bot rate limiter
router.use(perBotLimiter);

// Конфигурация бота
router.get('/bot-config', botConfigController.getPublicConfig);
router.get('/bot-config/full', botConfigController.getFullConfig);
router.get('/bot-config/health', botConfigController.healthCheck);

// Пользователи
router.get('/user', userController.getUser);
router.post('/user', userController.createOrUpdateUser);
router.get('/user/stats', userController.getUserStats);

// Колесо
router.post('/wheel/spin', spinLimiter, validateSpin, validate, wheelController.spin);
router.get('/wheel/history', wheelController.getSpinHistory);
router.get('/wheel/status', wheelController.getSpinStatus);

/**
 * Доменно-специфичные маршруты (опционально)
 */
const domainRouter = express.Router();
domainRouter.use(domainValidator);
domainRouter.use(botDetector);

// Можно добавить доменно-специфичные маршруты здесь

module.exports = router;
