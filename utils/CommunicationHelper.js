const { sendOTP: sendOTPFromService } = require('../services/communication/otpService');
const logger = require('./logger');
exports.sendOTP = async (identifierValue, otp) => {
  if (!identifierValue) {
    logger.error(' No identifier provided for sending OTP');
    throw new Error('Invalid contact information for OTP');
  }
  try {
    logger.info(`Sending OTP ${otp} to ${identifierValue}`);
    const result = await sendOTPFromService(identifierValue, otp);
    logger.info(`OTP successfully sent to ${identifierValue}`);
    return result;
  } catch (err) {
    logger.error(`Failed to send OTP to ${identifierValue}: ${err.message}`);
  }
};
