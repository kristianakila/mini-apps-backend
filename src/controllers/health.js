const { StatusCodes } = require('http-status-codes');
const { getFirestore } = require('../config/firebase');
const cache = require('../config/cache');
const logger = require('../utils/logger');

class HealthController {
  /**
   * GET /health
   * Проверка здоровья сервиса
   */
  async healthCheck(req, res) {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {},
    };
    
    let allHealthy = true;
    
    // Проверка Firebase
    try {
      const db = getFirestore();
      await db.collection('system').doc('health').get();
      health.services.firebase = {
        status: 'healthy',
        responseTime: 'ok',
      };
    } catch (error) {
      health.services.firebase = {
        status: 'unhealthy',
        error: error.message,
      };
      allHealthy = false;
    }
    
    // Проверка Redis (если используется)
    if (process.env.REDIS_ENABLED === 'true') {
      try {
        await cache.get('health-check');
        health.services.redis = {
          status: 'healthy',
        };
      } catch (error) {
        health.services.redis = {
          status: 'unhealthy',
          error: error.message,
        };
        allHealthy = false;
      }
    }
    
    // Проверка памяти
    health.memory = {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
    };
    
    // Проверка нагрузки
    health.load = {
      cpu: process.cpuUsage(),
      loadavg: process.loadavg(),
    };
    
    health.status = allHealthy ? 'healthy' : 'degraded';
    
    const statusCode = allHealthy ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE;
    
    res.status(statusCode).json(health);
  }
  
  /**
   * GET /health/ready
   * Проверка готовности к работе
   */
  async readinessCheck(req, res) {
    const readiness = {
      ready: true,
      timestamp: new Date().toISOString(),
      checks: [],
    };
    
    // Проверка Firebase
    try {
      const db = getFirestore();
      await db.collection('system').doc('health').get();
      readiness.checks.push({
        service: 'firebase',
        status: 'ready',
      });
    } catch (error) {
      readiness.checks.push({
        service: 'firebase',
        status: 'not_ready',
        error: error.message,
      });
      readiness.ready = false;
    }
    
    // Проверка необходимых коллекций
    try {
      const db = getFirestore();
      const collections = ['bots', 'system'];
      
      for (const collection of collections) {
        const snapshot = await db.collection(collection).limit(1).get();
        readiness.checks.push({
          service: `firestore.${collection}`,
          status: 'ready',
          hasData: !snapshot.empty,
        });
      }
    } catch (error) {
      readiness.checks.push({
        service: 'firestore.collections',
        status: 'not_ready',
        error: error.message,
      });
      readiness.ready = false;
    }
    
    const statusCode = readiness.ready ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE;
    
    res.status(statusCode).json(readiness);
  }
  
  /**
   * GET /health/bots/:botId
   * Проверка доступности конкретного бота
   */
  async botHealthCheck(req, res, next) {
    try {
      const { botId } = req.params;
      
      const db = getFirestore();
      const botDoc = await db.collection('bots').doc(botId).get();
      
      if (!botDoc.exists) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          error: {
            code: 'BOT_NOT_FOUND',
            message: 'Bot not found',
          },
        });
      }
      
      const botData = botDoc.data();
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          botId,
          name: botData.name,
          status: botData.status,
          configLoaded: true,
          usersCount: botData.usersCount || 0,
          totalSpins: botData.totalSpins || 0,
          lastUpdated: botData.updatedAt?.toDate()?.toISOString(),
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Bot health check error:', error);
      next(error);
    }
  }
}

module.exports = new HealthController();
