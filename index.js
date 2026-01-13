const app = require('./src/app');
const config = require('./src/config');
const logger = require('./src/utils/logger');

const PORT = config.port;

const server = app.listen(PORT, () => {
  logger.info(`
🚀 Server is running!
🌍 Environment: ${config.env}
📡 Port: ${PORT}
🕒 Time: ${new Date().toISOString()}
📊 API Version: ${config.apiVersion}
🔥 Firebase: ${config.firebase.projectId ? 'Connected' : 'Not configured'}
🔗 Redis: ${config.redis.enabled ? 'Enabled' : 'Disabled'}
  `);
  
  // Информация о маршрутах
  logger.info('Available routes:');
  logger.info(`  GET  /health`);
  logger.info(`  GET  /health/ready`);
  logger.info(`  GET  /api/${config.apiVersion}/bot-config`);
  logger.info(`  GET  /api/${config.apiVersion}/user`);
  logger.info(`  POST /api/${config.apiVersion}/wheel/spin`);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, starting graceful shutdown`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = server;
