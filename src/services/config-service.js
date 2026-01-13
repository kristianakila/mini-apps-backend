const { getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

class FirestoreService {
  constructor() {
    this.db = getFirestore();
  }
  
  /**
   * Получить документ бота по ID
   */
  async getBotById(botId) {
    try {
      const botDoc = await this.db.collection('bots').doc(botId).get();
      
      if (!botDoc.exists) {
        return null;
      }
      
      return {
        id: botDoc.id,
        ...botDoc.data(),
        // Конвертируем Timestamp в Date
        createdAt: botDoc.data().createdAt?.toDate() || null,
        updatedAt: botDoc.data().updatedAt?.toDate() || null,
      };
    } catch (error) {
      logger.error(`Error getting bot ${botId}:`, error);
      throw error;
    }
  }
  
  /**
   * Получить конфигурацию бота по ID
   */
  async getBotConfig(botId) {
    try {
      const bot = await this.getBotById(botId);
      if (!bot) {
        return null;
      }
      
      return {
        id: bot.id,
        name: bot.name,
        botUsername: bot.botUsername,
        status: bot.status,
        branding: bot.branding,
        texts: bot.texts,
        features: bot.features,
        subscription: bot.subscription,
        referral: bot.referral,
        leadForm: bot.leadForm,
        wheel: bot.wheel,
        limits: bot.limits,
        notifications: bot.notifications,
        metadata: bot.metadata,
        // Публичная статистика
        usersCount: bot.usersCount || 0,
        totalSpins: bot.totalSpins || 0,
        totalPrizes: bot.totalPrizes || 0,
        wheelItemsCount: bot.wheelItemsCount || 0,
      };
    } catch (error) {
      logger.error(`Error getting bot config ${botId}:`, error);
      throw error;
    }
  }
  
  /**
   * Получить пользователя бота
   */
  async getUser(botId, userId) {
    try {
      const userDoc = await this.db
        .collection('bots')
        .doc(botId)
        .collection('users')
        .doc(userId)
        .get();
      
      if (!userDoc.exists) {
        return null;
      }
      
      const data = userDoc.data();
      return {
        id: userDoc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || null,
        updatedAt: data.updatedAt?.toDate() || null,
        lastSpinAt: data.lastSpinAt?.toDate() || null,
        referralBonusExpiresAt: data.referralBonusExpiresAt?.toDate() || null,
      };
    } catch (error) {
      logger.error(`Error getting user ${userId} for bot ${botId}:`, error);
      throw error;
    }
  }
  
  /**
   * Создать/обновить пользователя
   */
  async saveUser(botId, userId, userData) {
    try {
      const userRef = this.db
        .collection('bots')
        .doc(botId)
        .collection('users')
        .doc(userId);
      
      const updateData = {
        ...userData,
        updatedAt: new Date(),
      };
      
      if (!userData.createdAt) {
        updateData.createdAt = new Date();
      }
      
      await userRef.set(updateData, { merge: true });
      
      return {
        id: userId,
        ...updateData,
      };
    } catch (error) {
      logger.error(`Error saving user ${userId} for bot ${botId}:`, error);
      throw error;
    }
  }
  
  /**
   * Сохранить результат спина
   */
  async saveSpinResult(botId, spinData) {
    try {
      const spinsRef = this.db
        .collection('bots')
        .doc(botId)
        .collection('spins');
      
      const spinResult = {
        ...spinData,
        createdAt: new Date(),
      };
      
      const docRef = await spinsRef.add(spinResult);
      
      return {
        id: docRef.id,
        ...spinResult,
      };
    } catch (error) {
      logger.error(`Error saving spin result for bot ${botId}:`, error);
      throw error;
    }
  }
  
  /**
   * Получить статистику спина пользователя
   */
  async getUserSpinStats(botId, userId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todaySpins = await this.db
        .collection('bots')
        .doc(botId)
        .collection('spins')
        .where('userId', '==', userId)
        .where('createdAt', '>=', today)
        .count()
        .get();
      
      const totalSpins = await this.db
        .collection('bots')
        .doc(botId)
        .collection('spins')
        .where('userId', '==', userId)
        .count()
        .get();
      
      return {
        dailySpins: todaySpins.data().count || 0,
        totalSpins: totalSpins.data().count || 0,
      };
    } catch (error) {
      logger.error(`Error getting spin stats for user ${userId} bot ${botId}:`, error);
      throw error;
    }
  }
  
  /**
   * Увеличить счетчик статистики бота
   */
  async incrementBotStat(botId, field, amount = 1) {
    try {
      const botRef = this.db.collection('bots').doc(botId);
      await botRef.update({
        [field]: admin.firestore.FieldValue.increment(amount),
        updatedAt: new Date(),
      });
      
      return true;
    } catch (error) {
      logger.error(`Error incrementing ${field} for bot ${botId}:`, error);
      throw error;
    }
  }
  
  /**
   * Получить настройки доменов
   */
  async getDomainSettings() {
    try {
      const settingsDoc = await this.db
        .collection('system')
        .doc('domains')
        .get();
      
      if (!settingsDoc.exists) {
        return { domains: {}, apiKeys: {} };
      }
      
      return settingsDoc.data();
    } catch (error) {
      logger.error('Error getting domain settings:', error);
      throw error;
    }
  }
}

module.exports = new FirestoreService();
