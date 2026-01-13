const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');
const AppError = require('../utils/errors').AppError;

/**
 * Глобальный обработчик ошибок
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;
  
  // Log error
  logger.error({
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    botContext: req.botContext,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  
  // Firebase ошибки
  if (err.code === 'firebase/not-found') {
    error = new AppError('Resource not found', StatusCodes.NOT_FOUND, 'NOT_FOUND');
  }
  
  if (err.code === 'firebase/permission-denied') {
    error = new AppError('Access denied', StatusCodes.FORBIDDEN, 'PERMISSION_DENIED');
  }
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new AppError(message, StatusCodes.BAD_REQUEST, 'VALIDATION_ERROR');
  }
  
  // Joi validation error
  if (err.isJoi) {
    error = new AppError(err.details[0].message, StatusCodes.BAD_REQUEST, 'VALIDATION_ERROR');
  }
  
  // Cast error (например, неверный ObjectId)
  if (err.name === 'CastError') {
    error = new AppError(`Invalid ${err.path}: ${err.value}`, StatusCodes.BAD_REQUEST, 'INVALID_ID');
  }
  
  // Duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new AppError(
      `Duplicate value for ${field}: ${err.keyValue[field]}`,
      StatusCodes.CONFLICT,
      'DUPLICATE_KEY'
    );
  }
  
  // Rate limit error
  if (err.name === 'RateLimitError') {
    error = new AppError(
      'Too many requests, please try again later',
      StatusCodes.TOO_MANY_REQUESTS,
      'RATE_LIMIT_EXCEEDED'
    );
  }
  
  // Default error
  const statusCode = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  const errorCode = error.errorCode || 'INTERNAL_ERROR';
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: error.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      ...(error.details && { details: error.details }),
    },
    requestId: req.id || req.headers['x-request-id'],
    timestamp: new Date().toISOString(),
  });
};

module.exports = errorHandler;
