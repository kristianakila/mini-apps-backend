const cache = require('../config/cache');
const firestoreService = require('./firestore-service');
const logger = require('../utils/logger');

class DomainService {
  constructor() {
    this.cache = cache;
    this.domainMap = new Map(); // In-memory кэш для частых запросов
  }
  
  /**
   * Получить botId по домену
   */
  async getBotIdByDomain(domain) {
    // Нормализуем домен
    const normalizedDomain = this.normalizeDomain(domain);
    const cacheKey = `domain:${normalizedDomain}:botId`;
    
    // Проверяем in-memory кэш
    if (this.domainMap.has(normalizedDomain)) {
      return this.domainMap.get(normalizedDomain);
    }
    
    // Проверяем Redis/NodeCache
    return this.cache.getOrSet(cacheKey, async () => {
      try {
        const settings = await firestoreService.getDomainSettings();
        const botId = settings.domains?.[normalizedDomain];
        
        if (botId) {
          // Сохраняем в in-memory кэш
          this.domainMap.set(normalizedDomain, botId);
          logger.debug(`Domain mapping found: ${normalizedDomain} -> ${botId}`);
          return botId;
        }
        
        logger.debug(`No domain mapping for: ${normalizedDomain}`);
        return null;
      } catch (error) {
        logger.error(`Error getting botId for domain ${normalizedDomain}:`, error);
        return null;
      }
    }, 3600); // Кэшируем на 1 час
  }
  
  /**
   * Получить botId по API ключу
   */
  async getBotIdByApiKey(apiKey) {
    const cacheKey = `apikey:${apiKey}:botId`;
    
    return this.cache.getOrSet(cacheKey, async () => {
      try {
        const settings = await firestoreService.getDomainSettings();
        const botId = settings.apiKeys?.[apiKey];
        
        if (botId) {
          logger.debug(`API key mapping found: ${apiKey} -> ${botId}`);
          return botId;
        }
        
        logger.debug(`No API key mapping for: ${apiKey}`);
        return null;
      } catch (error) {
        logger.error(`Error getting botId for API key:`, error);
        return null;
      }
    }, 300); // Кэшируем на 5 минут
  }
  
  /**
   * Валидация botId (существует ли бот)
   */
  async validateBotId(botId) {
    const cacheKey = `bot:${botId}:exists`;
    
    return this.cache.getOrSet(cacheKey, async () => {
      try {
        const bot = await firestoreService.getBotById(botId);
        const isValid = !!(bot && bot.status === 'active');
        
        logger.debug(`Bot validation: ${botId} -> ${isValid}`);
        return isValid;
      } catch (error) {
        logger.error(`Error validating bot ${botId}:`, error);
        return false;
      }
    }, 60); // Кэшируем на 1 минуту
  }
  
  /**
   * Получить все домены для бота
   */
  async getBotDomains(botId) {
    const cacheKey = `bot:${botId}:domains`;
    
    return this.cache.getOrSet(cacheKey, async () => {
      try {
        const settings = await firestoreService.getDomainSettings();
        const domains = settings.domains || {};
        
        const botDomains = Object.entries(domains)
          .filter(([domain, id]) => id === botId)
          .map(([domain]) => domain);
        
        return botDomains;
      } catch (error) {
        logger.error(`Error getting domains for bot ${botId}:`, error);
        return [];
      }
    }, 300); // Кэшируем на 5 минут
  }
  
  /**
   * Инвалидация кэша доменов
   */
  async invalidateDomainCache(domain = null) {
    if (domain) {
      const normalizedDomain = this.normalizeDomain(domain);
      await this.cache.del(`domain:${normalizedDomain}:botId`);
      this.domainMap.delete(normalizedDomain);
    } else {
      // Инвалидируем все домены
      await this.cache.clearByPattern('domain:');
      this.domainMap.clear();
    }
    
    logger.info(`Domain cache invalidated for ${domain || 'all domains'}`);
  }
  
  /**
   * Нормализация домена
   */
  normalizeDomain(domain) {
    if (!domain) return '';
    
    // Убираем порт
    let normalized = domain.split(':')[0];
    
    // Убираем www
    if (normalized.startsWith('www.')) {
      normalized = normalized.substring(4);
    }
    
    // Приводим к нижнему регистру
    normalized = normalized.toLowerCase();
    
    return normalized;
  }
  
  /**
   * Регистрация домена для бота
   */
  async registerDomain(botId, domain, apiKey = null) {
    try {
      const normalizedDomain = this.normalizeDomain(domain);
      
      // Получаем текущие настройки
      const settings = await firestoreService.getDomainSettings();
      const domains = settings.domains || {};
      const apiKeys = settings.apiKeys || {};
      
      // Обновляем домен
      domains[normalizedDomain] = botId;
      
      // Обновляем API ключ если предоставлен
      if (apiKey) {
        apiKeys[apiKey] = botId;
      }
      
      // Сохраняем в Firestore
      await firestoreService.db
        .collection('system')
        .doc('domains')
        .set({ domains, apiKeys }, { merge: true });
      
      // Инвалидируем кэш
      await this.invalidateDomainCache(normalizedDomain);
      if (apiKey) {
        await this.cache.del(`apikey:${apiKey}:botId`);
      }
      
      logger.info(`Domain registered: ${domain} -> ${botId}`);
      
      return {
        success: true,
        domain: normalizedDomain,
        botId,
      };
    } catch (error) {
      logger.error(`Error registering domain ${domain} for bot ${botId}:`, error);
      throw error;
    }
  }
}

module.exports = new DomainService();
