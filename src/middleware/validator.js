const { body, query, param, validationResult } = require('express-validator');
const { StatusCodes } = require('http-status-codes');
const AppError = require('../utils/errors').AppError;

/**
 * Валидация botId
 */
const validateBotId = [
  query('botId')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('botId must be a non-empty string')
    .isLength({ min: 1, max: 100 })
    .withMessage('botId must be between 1 and 100 characters'),
];

/**
 * Валидация userId
 */
const validateUserId = [
  body('userId')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('userId must be a non-empty string')
    .isLength({ min: 1, max: 100 })
    .withMessage('userId must be between 1 and 100 characters'),
  
  query('userId')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('userId must be a non-empty string')
    .isLength({ min: 1, max: 100 })
    .withMessage('userId must be between 1 and 100 characters'),
];

/**
 * Валидация спина колеса
 */
const validateSpin = [
  body('userId')
    .exists()
    .withMessage('userId is required')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('userId must be a non-empty string'),
  
  body('telegramId')
    .optional()
    .isString()
    .trim()
    .withMessage('telegramId must be a string'),
  
  body('initData')
    .optional()
    .isString()
    .trim()
    .withMessage('initData must be a string'),
];

/**
 * Валидация реферального кода
 */
const validateReferral = [
  query('refCode')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('refCode must be between 3 and 50 characters'),
];

/**
 * Middleware для проверки результатов валидации
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
    }));
    
    return next(new AppError(
      'Validation failed',
      StatusCodes.BAD_REQUEST,
      'VALIDATION_ERROR',
      { details: errorMessages }
    ));
  }
  next();
};

module.exports = {
  validateBotId,
  validateUserId,
  validateSpin,
  validateReferral,
  validate,
};
