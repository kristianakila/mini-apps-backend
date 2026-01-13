const { StatusCodes } = require('http-status-codes');
const config = require('../config');
const domainService = require('../services/domain-service');
const logger = require('../utils/logger');
const AppError = require('../utils/errors').AppError;

/**
 * Middleware для определения botId по разным стратегиям
 */
const botDetector = async (req, res, next) => {
  try {
    let botId = null;
    let detectionMethod = 'unknown';
    
    // Стратегия 1: По домену (для production сайтов)
    const host = req.get('host');
    if (host) {
      const domainBotId = await domainService.getBotIdByDomain(host);
      if (domainBotId) {
        botId = domainBotId;
        detectionMethod = 'domain';
        logger.debug(`Bot detected by domain: ${host} -> ${botId}`);
      }
    }
    
    // Стратегия 2: По API ключу (для прямых API запросов)
    if (!botId && config.security.apiKeyHeader) {
      const apiKey = req.get(config.security.apiKeyHeader);
      if (apiKey) {
        const apiKeyBotId = await domainService.getBotIdByApiKey(apiKey);
        if (apiKeyBotId) {
          botId = apiKeyBotId;
          detectionMethod = 'api_key';
          logger.debug(`Bot detected by API key: ${botId}`);
        }
      }
    }
    
    // Стратегия 3: По query параметру (для отладки и PageGenerator)
    if (!botId && req.query.botId) {
      botId = req.query.botId;
      detectionMethod = 'query_param';
      logger.debug(`Bot detected by query param: ${botId}`);
    }
    
    // Стратегия 4: По заголовку (для системных вызовов)
    if (!botId && config.security.botIdHeader) {
      const headerBotId = req.get(config.security.botIdHeader);
      if (headerBotId) {
        botId = headerBotId;
        detectionMethod = 'header';
        logger.debug(`Bot detected by header: ${botId}`);
      }
    }
    
    // Стратегия 5: По referer (fallback)
    if (!botId && req.headers.referer) {
      try {
        const refererUrl = new URL(req.headers.referer);
        const refererDomain = refererUrl.hostname;
        const refererBotId = await domainService.getBotIdByDomain(refererDomain);
        if (refererBotId) {
          botId = refererBotId;
          detectionMethod = 'referer';
          logger.debug(`Bot detected by referer: ${refererDomain} -> ${botId}`);
        }
      } catch (error) {
        // Invalid referer URL, skip
      }
    }
    
    // Если botId не найден
    if (!botId) {
      return next(new AppError(
        'Bot identification failed. Provide botId via query param, API key, or use registered domain.',
        StatusCodes.BAD_REQUEST,
        'BOT_ID_REQUIRED'
      ));
    }
    
    // Проверяем существование бота
    const botExists = await domainService.validateBotId(botId);
    if (!botExists) {
      return next(new AppError(
        `Bot with ID ${botId} not found or inactive`,
        StatusCodes.NOT_FOUND,
        'BOT_NOT_FOUND'
      ));
    }
    
    // Сохраняем в request context
    req.botContext = {
      botId,
      detectionMethod,
      host,
      timestamp: new Date().toISOString(),
    };
    
    logger.debug(`Bot context set: ${JSON.stringify(req.botContext)}`);
    next();
  } catch (error) {
    logger.error('Bot detection error:', error);
    next(error);
  }
};

/**
 * Middleware для проверки домена (опционально, для production)
 */
const domainValidator = (req, res, next) => {
  const host = req.get('host');
  
  // Если есть разрешенные домены и запрос не с localhost
  if (config.security.allowedDomains.length > 0 && 
      host && 
      !host.includes('localhost') && 
      !host.includes('127.0.0.1')) {
    
    const domainParts = host.split(':')[0]; // Убираем порт
    const isAllowed = config.security.allowedDomains.some(allowed => 
      domainParts === allowed || domainParts.endsWith(`.${allowed}`)
    );
    
    if (!isAllowed) {
      return next(new AppError(
        `Domain ${host} is not authorized to access this API`,
        StatusCodes.FORBIDDEN,
        'DOMAIN_NOT_ALLOWED'
      ));
    }
  }
  
  next();
};

module.exports = {
  botDetector,
  domainValidator,
};
