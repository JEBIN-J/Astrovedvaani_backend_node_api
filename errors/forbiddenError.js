const ApiError = require("./apiError");

class ForbiddenError extends ApiError {
  constructor(message = "Forbidden", errors = []) {
    super(message, 403, errors);
  }
}

module.exports = ForbiddenError;