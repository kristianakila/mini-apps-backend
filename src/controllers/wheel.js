const { StatusCodes } = require('http-status-codes');
const wheelService = require('../services/wheel-service');
const userService = require('../services/user-service');
const logger = require('../utils/logger');

class WheelController {
  /**
   * POST /api/wheel/spin
   * Выполнить спин колеса
   */
  async spin(req, res, next) {
    try {
      const { botId } = req.botContext;
      const { userId, telegramId, initData } = req.body;
      
      if (!userId) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: {
            code: 'USER_ID_REQUIRED',
            message: 'userId is required',
          },
        });
      }
      
      logger.info(`Spin request: user ${userId}, bot ${botId}`);
      
      const spinResult = await wheelService.spinWheel(botId, userId, {
        telegramId,
        initData,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      
      if (!spinResult.success) {
        return res.status(StatusCodes.OK).json({
          success: false,
          error: {
            code: spinResult.error,
            message: this.getErrorMessage(spinResult.error),
            ...(spinResult.cooldown && { cooldown: spinResult.cooldown }),
            ...(spinResult.remainingSpins !== undefined && { 
              remainingSpins: spinResult.remainingSpins 
            }),
          },
          data: {
            allowed: false,
            userStats: spinResult.userStats,
          },
        });
      }
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: spinResult,
        meta: {
          botId,
          userId,
          spinId: spinResult.spinId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Spin error:', error);
      next(error);
    }
  }
  
  /**
   * GET /api/wheel/history
   * Получить историю спинов
   */
  async getSpinHistory(req, res, next) {
    try {
      const { botId } = req.botContext;
      const { userId, limit = 10 } = req.query;
      
      if (!userId) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: {
            code: 'USER_ID_REQUIRED',
            message: 'userId is required',
          },
        });
      }
      
      logger.debug(`Getting spin history for user: ${userId}`);
      
      const history = await wheelService.getSpinHistory(botId, userId, parseInt(limit, 10));
      const userStats = await userService.getUserForFrontend(botId, userId);
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          history,
          userStats: userStats?.stats || {},
        },
        meta: {
          botId,
          userId,
          count: history.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting spin history:', error);
      next(error);
    }
  }
  
  /**
   * GET /api/wheel/status
   * Получить статус спина (остатки, кд и т.д.)
   */
  async getSpinStatus(req, res, next) {
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
        data: {
          canSpin: userStats.stats.remainingSpins > 0 && userStats.stats.cooldownRemaining <= 0,
          userStats: userStats.stats,
          referralStats: userStats.referral.stats,
        },
        meta: {
          botId,
          userId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting spin status:', error);
      next(error);
    }
  }
  
  /**
   * Получить человеческое сообщение об ошибке
   */
  getErrorMessage(errorCode) {
    const messages = {
      DAILY_LIMIT_REACHED: 'Вы исчерпали дневной лимит спинов',
      COOLDOWN_ACTIVE: 'Пожалуйста, подождите перед следующим спином',
      USER_NOT_FOUND: 'Пользователь не найден',
      BOT_INACTIVE: 'Бот временно неактивен',
      SUBSCRIPTION_REQUIRED: 'Требуется подписка на канал',
      REFERRAL_REQUIRED: 'Требуется пригласить друзей',
    };
    
    return messages[errorCode] || 'Произошла ошибка';
  }
}

module.exports = new WheelController();
