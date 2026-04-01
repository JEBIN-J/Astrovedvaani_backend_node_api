const {
  ApiError,
  BadRequestError,
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  TokenExpiredError,
  InvalidTokenError,
  MissingTokenError,
  InsufficientBalanceError,
} = require("../errors");

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    let statusCode = 500;
    let message = error.message || "Internal server error";
    if (error instanceof BadRequestError) statusCode = 400;
    else if (error instanceof ValidationError) statusCode = 422;
    else if (error instanceof ConflictError) statusCode = 409;
    else if (error instanceof NotFoundError) statusCode = 404;
    else if (error instanceof UnauthorizedError) statusCode = 401;
    else if (error instanceof ForbiddenError) statusCode = 403;
    else if (error instanceof TokenExpiredError) statusCode = 401;
    else if (error instanceof InvalidTokenError) statusCode = 401;
    else if (error instanceof MissingTokenError) statusCode = 401;
    else if (error instanceof InsufficientBalanceError) statusCode = 402;
    else if (error.code === 11000) {
      statusCode = 400;
      const field = Object.keys(error.keyValue)[0];
      message = `${field} already exists`;
    }
    const response = {
      success: false,
      message,
    };
    if (process.env.NODE_ENV !== "production") {
      response.stack = error.stack;
    }
    return res.status(statusCode).json(response);
  });
};

module.exports = asyncHandler;