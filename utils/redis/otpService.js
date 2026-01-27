const logger = require("../logger");
const redisClient = require("./redisClient");

const EXPIRY = parseInt(process.env.OTP_EXPIRE || "120", 10);
const DIGITS = parseInt(process.env.OTP_DIGITS || "4", 10);

class OTPService {
  static generateOTP() {
    const min = Math.pow(10, DIGITS - 1);
    const max = Math.pow(10, DIGITS) - 1;
    return Math.floor(Math.random() * (max - min + 1)) + min + "";
  }

  static async storeOTP(userId, otp) {
    try {
      logger.info(`Storing OTP for user:${userId}`);
      await redisClient.setEx(`otp:${userId}`, EXPIRY, otp);
    } catch (err) {
      logger.error(
        `Failed to store OTP in Redis for ${userId}: ${err.message}`,
      );
      throw new Error("Internal error while storing OTP");
    }
  }
  static async validateOTP(userId, inputOtp) {
    try {
      const key = `otp:${userId}`;
      const storedOtp = await redisClient.get(key);
      if (!storedOtp) {
        logger.warn(`OTP not found or expired for user:${userId}`);
        return false;
      }
      const match = storedOtp === inputOtp;
      if (match) {
        await redisClient.del(key);
        logger.info(`OTP verified successfully for user:${userId}`);
      } else {
        logger.warn(`Invalid OTP for user:${userId}`);
      }

      return match;
    } catch (err) {
      logger.error(`OTP validation failed for ${userId}: ${err.message}`);
      return false;
    }
  }
  static async storeEmailOTP(email, otp) {
    try {
      logger.info(`[OTP] Storing email OTP | email: ${email}`);
      await redisClient.setEx(`otp:email:${email}`, EXPIRY, otp);
    } catch (err) {
      logger.error(
        `[OTP] Failed storing email OTP for ${email}: ${err.message}`,
      );
      throw new Error("Internal error while storing email OTP");
    }
  }

  static async validateEmailOTP(email, inputOtp) {
    try {
      const key = `otp:email:${email}`;
      const storedOtp = await redisClient.get(key);

      if (!storedOtp) {
        logger.warn(`[OTP] Email OTP missing/expired | email: ${email}`);
        return false;
      }

      if (storedOtp === inputOtp) {
        await redisClient.del(key);
        logger.info(`[OTP] Email OTP verified | email: ${email}`);
        return true;
      }

      logger.warn(`[OTP] Invalid email OTP | email: ${email}`);
      return false;
    } catch (err) {
      logger.error(`[OTP] Email OTP validation failed: ${err.message}`);
      return false;
    }
  }
}

module.exports = OTPService;
