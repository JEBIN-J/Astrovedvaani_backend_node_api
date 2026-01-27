const { ApiError } = require("../errors");
const logger = require("../utils/logger");
console.log("Logger loaded:", logger ? "yes" : "no");

const errorHandler = (err, req, res, next) => {
  let error = err;
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    const stack = error.stack || new Error().stack;
    error = new ApiError(message, statusCode, stack);
  }
  logger.error({
    message: error.message,
    statusCode: error.statusCode,
    method: req.method,
    url: req.originalUrl,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });
  const response = {
    success: false,
    message: error.message,
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  };
  res.status(error.statusCode).json(response);
};

module.exports = errorHandler;