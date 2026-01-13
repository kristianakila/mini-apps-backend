const crypto = require('crypto');
const firestoreService = require('./firestore-service');
const cache = require('../config/cache');
const logger = require('../utils/logger');

class UserService {
  /**
   * Получить или создать пользователя
   */
  async getOrCreateUser(botId, userData) {
    const { userId, telegramId, initData, refCode } = userData;
    
    // Генерируем ID пользователя если не предоставлен
    const finalUserId = userId || this.generateUserId(telegramId, botId);
    
    // Проверяем существующего пользователя
    let user = await firestoreService.getUser(botId, finalUserId);
    
    if (user) {
      // Обновляем данные если нужно
      const updates = {};
      
      if (telegramId && !user.telegramId) {
        updates.telegramId = telegramId;
      }
      
      if (initData && !user.initData) {
        updates.initData = initData;
        updates.telegramData = this.parseInitData(initData);
      }
      
      if (Object.keys(updates).length > 0) {
        user = await firestoreService.saveUser(botId, finalUserId, {
          ...user,
          ...updates,
        });
      }
      
      return user;
    }
    
    // Создаем нового пользователя
    const newUser = {
      telegramId,
      initData,
      telegramData: initData ? this.parseInitData(initData) : null,
      refCode,
      referralCode: this.generateReferralCode(),
      invitedBy: refCode ? await this.getUserIdByReferralCode(botId, refCode) : null,
      stats: {
        totalSpins: 0,
        totalWins: 0,
        totalPoints: 0,
        referralCount: 0,
        referralBonusReceived: false,
      },
      limits: {
        dailySpins: 0,
        lastSpinAt: null,
        cooldownUntil: null,
      },
      status: 'active',
      ipAddress: userData.ipAddress,
      userAgent: userData.userAgent,
    };
    
    user = await firestoreService.saveUser(botId, finalUserId, newUser);
    
    // Увеличиваем счетчик пользователей бота
    if (!refCode) {
      await firestoreService.incrementBotStat(botId, 'usersCount');
    }
    
    logger.info(`User created: ${finalUserId} for bot ${botId}`);
    return user;
  }
  
  /**
   * Получить данные пользователя для фронтенда
   */
  async getUserForFrontend(botId, userId) {
    const user = await firestoreService.getUser(botId, userId);
    
    if (!user) {
      return null;
    }
    
    // Получаем статистику спина
    const spinStats = await firestoreService.getUserSpinStats(botId, userId);
    
    // Рассчитываем доступные спины
    const botConfig = await firestoreService.getBotConfig(botId);
    const dailyLimit = botConfig?.limits?.spinsPerDay || 3;
    const remainingSpins = Math.max(0, dailyLimit - spinStats.dailySpins);
    
    // Проверяем кд
    const cooldownSeconds = botConfig?.limits?.cooldownSeconds || 3600;
    let cooldownRemaining = 0;
    
    if (user.limits?.lastSpinAt) {
      const lastSpinTime = new Date(user.limits.lastSpinAt).getTime();
      const cooldownUntil = lastSpinTime + (cooldownSeconds * 1000);
      const now = Date.now();
      
      if (now < cooldownUntil) {
        cooldownRemaining = Math.ceil((cooldownUntil - now) / 1000);
      }
    }
    
    // Получаем реферальную статистику
    const referralStats = await this.getReferralStats(botId, userId);
    
    return {
      id: user.id,
      telegramId: user.telegramId,
      referralCode: user.referralCode,
      stats: {
        totalSpins: user.stats?.totalSpins || 0,
        totalWins: user.stats?.totalWins || 0,
        totalPoints: user.stats?.totalPoints || 0,
        referralCount: user.stats?.referralCount || 0,
        dailySpins: spinStats.dailySpins,
        remainingSpins,
        cooldownRemaining,
      },
      referral: {
        code: user.referralCode,
        invitedBy: user.invitedBy,
        stats: referralStats,
        bonusReceived: user.stats?.referralBonusReceived || false,
      },
      createdAt: user.createdAt,
      lastActiveAt: user.updatedAt,
    };
  }
  
  /**
   * Обновить статистику пользователя после спина
   */
  async updateUserAfterSpin(botId, userId, spinResult) {
    const updates = {
      'stats.totalSpins': firestoreService.admin.firestore.FieldValue.increment(1),
      'limits.lastSpinAt': new Date(),
      'limits.cooldownUntil': new Date(Date.now() + (spinResult.cooldownSeconds * 1000)),
      updatedAt: new Date(),
    };
    
    if (spinResult.won) {
      updates['stats.totalWins'] = firestoreService.admin.firestore.FieldValue.increment(1);
      updates['stats.totalPoints'] = firestoreService.admin.firestore.FieldValue.increment(
        spinResult.prizeValue || 0
      );
    }
    
    await firestoreService.saveUser(botId, userId, updates);
    
    // Инвалидируем кэш пользователя
    await cache.del(`user:${botId}:${userId}:frontend`);
  }
  
  /**
   * Получить реферальную статистику
   */
  async getReferralStats(botId, userId) {
    const cacheKey = `user:${botId}:${userId}:referral-stats`;
    
    return cache.getOrSet(cacheKey, async () => {
      // TODO: Реализовать подсчет рефералов
      return {
        invitedCount: 0,
        requiredInvites: 3,
        bonusReceived: false,
      };
    }, 60); // Кэшируем на 1 минуту
  }
  
  /**
   * Получить ID пользователя по реферальному коду
   */
  async getUserIdByReferralCode(botId, referralCode) {
    // TODO: Реализовать поиск по referralCode в Firestore
    // Это упрощенная версия
    const usersRef = firestoreService.db
      .collection('bots')
      .doc(botId)
      .collection('users');
    
    const query = await usersRef
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get();
    
    if (!query.empty) {
      return query.docs[0].id;
    }
    
    return null;
  }
  
  /**
   * Генерация ID пользователя
   */
  generateUserId(telegramId, botId) {
    if (telegramId) {
      return `tg_${telegramId}`;
    }
    
    // Генерация случайного ID
    return `user_${crypto.randomBytes(8).toString('hex')}`;
  }
  
  /**
   * Генерация реферального кода
   */
  generateReferralCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  
  /**
   * Парсинг initData от Telegram
   */
  parseInitData(initData) {
    try {
      const params = new URLSearchParams(initData);
      const userParam = params.get('user');
      
      if (userParam) {
        return JSON.parse(decodeURIComponent(userParam));
      }
      
      return null;
    } catch (error) {
      logger.error('Error parsing initData:', error);
      return null;
    }
  }
}

module.exports = new UserService();
