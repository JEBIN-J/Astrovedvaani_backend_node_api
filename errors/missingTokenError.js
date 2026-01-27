const ApiError = require("./apiError");

class MissingTokenError extends ApiError {
  constructor(
    message = "No authentication token provided",
    errors = [],
    stack = ""
  ) {
    super(message, 401, errors, stack);
    this.code = "MISSING_TOKEN";
  }
}
module.exports = MissingTokenError;