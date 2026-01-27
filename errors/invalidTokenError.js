const ApiError = require("./apiError");

class InvalidTokenError extends ApiError {
  constructor(
    message = "Invalid authentication token",
    errors = [],
    stack = ""
  ) {
    super(message, 401, errors, stack);
    this.code = "INVALID_TOKEN";
  }
}

module.exports = InvalidTokenError;