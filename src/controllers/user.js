const { StatusCodes } = require('http-status-codes');
const userService = require('../services/user-service');
const logger = require('../utils/logger');

class UserController {
  /**
   * GET /api/user
   * Получить данные пользователя
   */
  async getUser(req, res, next) {
    try {
      const { botId } = req.botContext;
      const { userId, createIfMissing = 'true' } = req.query;
      
      if (!userId) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: {
            code: 'USER_ID_REQUIRED',
            message: 'userId is required',
          },
        });
      }
      
      logger.info(`Getting user data: ${userId} for bot ${botId}`);
      
      let userData;
      
      if (createIfMissing === 'true') {
        // Создаем пользователя если не существует
        userData = await userService.getOrCreateUser(botId, {
          userId,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        });
      } else {
        // Только получение существующего пользователя
        userData = await userService.getUserForFrontend(botId, userId);
      }
      
      if (!userData) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: userData,
        meta: {
          botId,
          userId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting user:', error);
      next(error);
    }
  }
  
  /**
   * POST /api/user
   * Создать/обновить пользователя
   */
  async createOrUpdateUser(req, res, next) {
    try {
      const { botId } = req.botContext;
      const { userId, telegramId, initData, refCode } = req.body;
      
      if (!userId && !telegramId) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: {
            code: 'IDENTIFIER_REQUIRED',
            message: 'Either userId or telegramId is required',
          },
        });
      }
      
      logger.info(`Creating/updating user for bot ${botId}`);
      
      const userData = await userService.getOrCreateUser(botId, {
        userId,
        telegramId,
        initData,
        refCode,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: await userService.getUserForFrontend(botId, userData.id),
        meta: {
          botId,
          userId: userData.id,
          created: !userId, // Был ли создан новый пользователь
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error creating/updating user:', error);
      next(error);
    }
  }
  
  /**
   * GET /api/user/stats
   * Получить статистику пользователя
   */
  async getUserStats(req, res, next) {
    try {
      const { botId } = req.botContext;
      const { userId } = req.query;
      
      if (!userId) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: {
            code: 'USER_ID_REQUIRED',
            message: 'userId is required',
          },
        });
      }
      
      logger.debug(`Getting stats for user: ${userId} bot: ${botId}`);
      
      const userStats = await userService.getUserForFrontend(botId, userId);
      
      if (!userStats) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: userStats,
        meta: {
          botId,
          userId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting user stats:', error);
      next(error);
    }
  }
}

module.exports = new UserController();
