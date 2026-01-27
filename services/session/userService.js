const User = require("../../models/User");
const Wallet = require("../../models/Wallet");
const WalletLedger = require("../../models/Ledger");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");

async function getUserById(userId) {
  return await User.findById(userId);
}

async function isNewUser(userId) {
  const user = await User.findById(userId).select("isNewUser");
  return user?.isNewUser === true;
}

async function updateUser(userId) {
  const user = await User.findById(userId).select("isNewUser");

  if (user?.isNewUser === true) {
    user.isNewUser = false;
    await user.save();
  }
  logger.info("User Updated from New To Old");

  return user?.isNewUser === false;
}

async function getUserWallet(userId) {
  return await Wallet.findOne({ user_id: userId });
}
async function getWalletSessionEligibility(userId, ratePerMinute) {
  logger.info(
    `Checking wallet session eligibility for userId: ${userId}, ratePerMinute: ${ratePerMinute}`,
  );
  const user = await getUserById(userId);
  logger.info(` user object ${user.mobileNumber}`);
  const wallet = await getUserWallet(userId);
  logger.info(`Fetched wallet: ${JSON.stringify(wallet)}`);

  if (!wallet || wallet.balance <= 0) {
    logger.info(`User is not eligible: Insufficient wallet balance`);
    return { eligible: false, reason: "Insufficient wallet balance" };
  }

  const maxDuration = Math.floor(wallet.balance / ratePerMinute);
  logger.info(`Calculated maxDuration: ${maxDuration}`);

  if (maxDuration < 1) {
    logger.info(`User is not eligible: Not enough balance for even 1 minute`);
    return { eligible: false, reason: "Not enough balance for even 1 minute" };
  }

  logger.info(`User is eligible. Returning wallet and maxDuration.`);
  return {
    eligible: true,
    wallet,
    maxDuration,
  };
}

async function createLedgerEntry({
  wallet_id,
  amount,
  direction,
  transaction_type = Enums.TRANSACTION.TYPE.SESSION,
  payment_method = Enums.PAYMENT.METHOD.WALLET,
  payment_provider = Enums.PAYMENT.PROVIDER.astrovedvanni,
  related_entity,
  remarks = null,
}) {
  const ledger = await WalletLedger.create({
    wallet_id,
    transaction_type,
    direction,
    amount,
    final_amount: amount,
    gst_included: false,
    gst_percent: 0,
    payment_method,
    payment_provider,
    related_entity,
    remarks,
  });

  return ledger;
}

async function getAdminUserId() {
  try {
    const adminUser = await User.findOne({
      role: Enums.USER.ROLE.SUPER_ADMIN,
    }).select("_id");
    return adminUser ? adminUser._id : null;
  } catch (error) {
    console.error("Error fetching admin user:", error);
    throw error;
  }
}

module.exports = {
  getUserById,
  getUserWallet,
  getWalletSessionEligibility,
  createLedgerEntry,
  isNewUser,
  getAdminUserId,
  updateUser,
};
