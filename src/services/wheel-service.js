const firestoreService = require('./firestore-service');
const userService = require('./user-service');
const logger = require('../utils/logger');

class WheelService {
  /**
   * Выполнить спин колеса
   */
  async spinWheel(botId, userId, userData = {}) {
    try {
      // Получаем конфигурацию бота
      const botConfig = await firestoreService.getBotConfig(botId);
      if (!botConfig || botConfig.status !== 'active') {
        throw new Error('Bot not found or inactive');
      }
      
      // Получаем данные пользователя
      const user = await userService.getOrCreateUser(botId, {
        userId,
        ...userData,
      });
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Проверяем лимиты
      const limitCheck = await this.checkSpinLimits(botId, userId, botConfig, user);
      if (!limitCheck.allowed) {
        return {
          success: false,
          error: limitCheck.error,
          cooldown: limitCheck.cooldown,
          remainingSpins: limitCheck.remainingSpins,
        };
      }
      
      // Выбираем приз на основе вероятностей
      const prize = this.selectPrize(botConfig.wheel.prizes);
      
      if (!prize) {
        throw new Error('No available prizes');
      }
      
      // Сохраняем результат спина
      const spinResult = {
        userId,
        botId,
        prizeId: prize.id,
        prizeName: prize.text,
        prizeValue: prize.value,
        prizeType: prize.type,
        won: prize.type !== 'none',
        probability: prize.probability,
        userData: {
          telegramId: user.telegramId,
          referralCode: user.referralCode,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          ipAddress: userData.ipAddress,
          userAgent: userData.userAgent,
        },
      };
      
      await firestoreService.saveSpinResult(botId, spinResult);
      
      // Обновляем пользователя
      await userService.updateUserAfterSpin(botId, userId, {
        cooldownSeconds: botConfig.limits.cooldownSeconds,
        prizeValue: prize.value,
        won: prize.type !== 'none',
      });
      
      // Обновляем статистику бота
      await firestoreService.incrementBotStat(botId, 'totalSpins');
      if (prize.type !== 'none') {
        await firestoreService.incrementBotStat(botId, 'totalPrizes');
      }
      
      // Проверяем реферальный бонус
      const referralBonus = await this.checkReferralBonus(botId, userId);
      
      // Подготовка ответа
      const response = {
        success: true,
        spinId: spinResult.id,
        prize: {
          id: prize.id,
          text: prize.text,
          value: prize.value,
          type: prize.type,
          color: prize.color,
        },
        userStats: {
          totalSpins: (user.stats?.totalSpins || 0) + 1,
          totalWins: (user.stats?.totalWins || 0) + (prize.type !== 'none' ? 1 : 0),
          totalPoints: (user.stats?.totalPoints || 0) + (prize.value || 0),
          dailySpins: limitCheck.dailySpins + 1,
          remainingSpins: Math.max(0, botConfig.limits.spinsPerDay - (limitCheck.dailySpins + 1)),
          cooldownSeconds: botConfig.limits.cooldownSeconds,
        },
        ...(referralBonus && { referralBonus }),
        timestamp: new Date().toISOString(),
      };
      
      logger.info(`Spin completed: user ${userId}, bot ${botId}, prize: ${prize.text}`);
      return response;
      
    } catch (error) {
      logger.error(`Spin error for user ${userId}, bot ${botId}:`, error);
      throw error;
    }
  }
  
  /**
   * Проверка лимитов спина
   */
  async checkSpinLimits(botId, userId, botConfig, user) {
    const limits = botConfig.limits;
    
    // Проверка дневного лимита
    const spinStats = await firestoreService.getUserSpinStats(botId, userId);
    if (spinStats.dailySpins >= limits.spinsPerDay) {
      return {
        allowed: false,
        error: 'DAILY_LIMIT_REACHED',
        dailySpins: spinStats.dailySpins,
        remainingSpins: 0,
      };
    }
    
    // Проверка кд
    if (user.limits?.cooldownUntil) {
      const cooldownUntil = new Date(user.limits.cooldownUntil).getTime();
      const now = Date.now();
      
      if (now < cooldownUntil) {
        const cooldownRemaining = Math.ceil((cooldownUntil - now) / 1000);
        return {
          allowed: false,
          error: 'COOLDOWN_ACTIVE',
          cooldown: cooldownRemaining,
          dailySpins: spinStats.dailySpins,
          remainingSpins: limits.spinsPerDay - spinStats.dailySpins,
        };
      }
    }
    
    // Другие проверки могут быть добавлены здесь
    // (возраст, регистрация, подписка и т.д.)
    
    return {
      allowed: true,
      dailySpins: spinStats.dailySpins,
      remainingSpins: limits.spinsPerDay - spinStats.dailySpins,
    };
  }
  
  /**
   * Выбор приза на основе вероятностей
   */
  selectPrize(prizes) {
    if (!prizes || prizes.length === 0) {
      return null;
    }
    
    // Фильтруем доступные призы
    const availablePrizes = prizes.filter(prize => prize.isAvailable !== false);
    
    if (availablePrizes.length === 0) {
      return null;
    }
    
    // Нормализуем вероятности
    const totalProbability = availablePrizes.reduce((sum, prize) => sum + (prize.probability || 0), 0);
    const normalizedPrizes = availablePrizes.map(prize => ({
      ...prize,
      normalizedProbability: (prize.probability || 0) / totalProbability,
    }));
    
    // Выбираем случайный приз
    let random = Math.random();
    for (const prize of normalizedPrizes) {
      if (random < prize.normalizedProbability) {
        return prize;
      }
      random -= prize.normalizedProbability;
    }
    
    // Fallback - последний приз
    return normalizedPrizes[normalizedPrizes.length - 1];
  }
  
  /**
   * Проверка реферального бонуса
   */
  async checkReferralBonus(botId, userId) {
    try {
      const user = await firestoreService.getUser(botId, userId);
      
      if (!user || user.stats?.referralBonusReceived) {
        return null;
      }
      
      // Проверяем достиг ли пользователь необходимого количества рефералов
      const referralStats = await userService.getReferralStats(botId, userId);
      const botConfig = await firestoreService.getBotConfig(botId);
      const requiredInvites = botConfig?.referral?.invitesRequired || 3;
      
      if (referralStats.invitedCount >= requiredInvites) {
        // Назначаем бонус
        const bonus = {
          type: botConfig?.referral?.rewardType || 'extra_spin',
          value: botConfig?.referral?.rewardValue || 1,
          text: botConfig?.referral?.rewardText || 'бонусный спин',
          description: botConfig?.referral?.rewardDescription,
          expiresAt: new Date(Date.now() + 
            (botConfig?.limits?.referralBonusExpiryDays || 30) * 24 * 60 * 60 * 1000
          ),
        };
        
        // Обновляем пользователя
        await firestoreService.saveUser(botId, userId, {
          'stats.referralBonusReceived': true,
          'stats.referralBonus': bonus,
          updatedAt: new Date(),
        });
        
        return bonus;
      }
      
      return null;
    } catch (error) {
      logger.error(`Referral bonus check error for user ${userId}:`, error);
      return null;
    }
  }
  
  /**
   * Получить историю спинов пользователя
   */
  async getSpinHistory(botId, userId, limit = 10) {
    try {
      const spinsRef = firestoreService.db
        .collection('bots')
        .doc(botId)
        .collection('spins')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit);
      
      const snapshot = await spinsRef.get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || null,
      }));
    } catch (error) {
      logger.error(`Error getting spin history for user ${userId}:`, error);
      throw error;
    }
  }
}

module.exports = new WheelService();
