const { StatusCodes } = require('http-status-codes');
const configService = require('../services/config-service');
const logger = require('../utils/logger');

class BotConfigController {
  /**
   * GET /api/bot-config
   * Получить публичную конфигурацию бота
   */
  async getPublicConfig(req, res, next) {
    try {
      const { botId } = req.botContext;
      const { includeSecrets } = req.query;
      
      logger.info(`Getting public config for bot: ${botId}`);
      
      let config;
      if (includeSecrets === 'true' && req.headers['x-api-key']) {
        // Для генератора страниц - полная конфигурация
        config = await configService.getFullConfigForGenerator(
          botId,
          req.headers['x-api-key']
        );
      } else {
        // Публичная конфигурация
        config = await configService.getPublicConfig(botId);
      }
      
      if (!config) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          error: {
            code: 'BOT_NOT_FOUND',
            message: 'Bot configuration not found',
          },
        });
      }
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: config,
        meta: {
          botId,
          timestamp: new Date().toISOString(),
          ttl: 600, // Время жизни кэша в секундах
        },
      });
    } catch (error) {
      logger.error('Error getting bot config:', error);
      next(error);
    }
  }
  
  /**
   * GET /api/bot-config/full
   * Получить полную конфигурацию для генератора
   * (Требуется API ключ)
   */
  async getFullConfig(req, res, next) {
    try {
      const { botId } = req.botContext;
      const apiKey = req.headers['x-api-key'];
      
      if (!apiKey) {
        return res.status(StatusCodes.UNAUTHORIZED).json({
          success: false,
          error: {
            code: 'API_KEY_REQUIRED',
            message: 'API key is required for full configuration',
          },
        });
      }
      
      logger.info(`Getting full config for bot: ${botId}`);
      
      const config = await configService.getFullConfigForGenerator(botId, apiKey);
      
      if (!config) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          error: {
            code: 'BOT_NOT_FOUND',
            message: 'Bot configuration not found',
          },
        });
      }
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: config,
        meta: {
          botId,
          timestamp: new Date().toISOString(),
          generatedFor: 'page-generator',
        },
      });
    } catch (error) {
      logger.error('Error getting full bot config:', error);
      next(error);
    }
  }
  
  /**
   * GET /api/bot-config/health
   * Проверить доступность конфигурации бота
   */
  async healthCheck(req, res, next) {
    try {
      const { botId } = req.botContext;
      
      const config = await configService.getPublicConfig(botId);
      
      if (!config) {
        return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
          success: false,
          error: {
            code: 'CONFIG_UNAVAILABLE',
            message: 'Bot configuration is not available',
          },
        });
      }
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          botId,
          status: config.status,
          name: config.name,
          botUsername: config.botUsername,
          configLoaded: true,
          cacheHit: false, // TODO: Добавить отслеживание кэша
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Bot config health check error:', error);
      next(error);
    }
  }
}

module.exports = new BotConfigController();
