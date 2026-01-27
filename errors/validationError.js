const ApiError = require("./apiError");

class ValidationError extends ApiError {
  constructor(message = "Validation Failed", errors = []) {
    super(message, 422, errors);
  }
}

module.exports = ValidationError;