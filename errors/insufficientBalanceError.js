const ApiError = require("./apiError");

class InsufficientBalanceError extends ApiError {
  constructor(message = "Insufficient wallet balance", errors = []) {
    super(message, 402, errors);
  }
}

module.exports = InsufficientBalanceError;