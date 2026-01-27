const rateLimit = require("express-rate-limit");
const { ApiError } = require("../errors");
const logger = require("../utils/logger");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    logger.warn(`Rate limit exceeded on ${req.originalUrl} by IP: ${req.ip}`);
    next(new ApiError(429, "Too many requests, please try again later."));
  },
});

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    const key = req.user?._id || req.ip;
    logger.warn(`Auth rate limit exceeded on ${req.originalUrl} by key: ${key}`);
    next(new ApiError(429, "Too many login/signup attempts. Please try again later."));
  },
});

module.exports = { apiLimiter, authLimiter };
