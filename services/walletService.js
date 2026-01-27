const Wallet = require("../models/Wallet");
const logger = require("../utils/logger");
const WalletLedger = require("../models/Ledger");
const Enums = require("../utils/constants");
const walletNotification = require("../services/socket/walletNotification");
const createWallet = async (userId) => {
  const existingWallet = await Wallet.findOne({ user_id: userId });
  if (existingWallet) return existingWallet;
  const wallet = new Wallet({
    user_id: userId,
    balance: 0,
  });
  logger.info(`Creating wallet for user ${userId}`);
  return wallet.save();
};

const creditWallet = async (userId, amount, reason = "") => {
  if (!amount || amount <= 0) return;
  const wallet = await Wallet.findOneAndUpdate(
    { user_id: userId },
    { $inc: { balance: amount }, $set: { last_updated: new Date() } },
    { new: true, upsert: true },
  );
  logger.info(
    `Credited ₹${amount} to user ${userId} wallet. Reason: ${reason}`,
  );
  return wallet;
};

const updateWalletAndLedger = async ({
  userId,
  amount,
  remarks,
  transactionType = Enums.TRANSACTION.TYPE.PURCHASE,
  relatedEntityId = null,
  relatedEntityType = Enums.ENTITY.TYPE.PRODUCT,
}) => {
  if (!amount || amount === 0) return;

  const wallet = await Wallet.findOneAndUpdate(
    { user_id: userId },
    { $setOnInsert: { balance: 0 }, $set: { last_updated: new Date() } },
    { new: true, upsert: true },
  );

  const openingBalance = wallet.balance; //  OPENING BALANCE

  amount = Math.round(amount * 100) / 100;
  wallet.balance = Math.round((wallet.balance + amount) * 100) / 100;

  if (wallet.balance < 0) throw new Error("Insufficient wallet balance");

  await wallet.save();

  const closingBalance = wallet.balance; //  CLOSING BALANCE

  try {
    await walletNotification.emitWalletUpdate(
      userId.toString(),
      Math.abs(amount),
      openingBalance,
      closingBalance,
      "success",
      "product",
    );
  } catch (err) {
    logger.warn(`[WalletService] emitWalletUpdate failed: ${err.message}`);
  }

  const direction =
    amount > 0
      ? Enums.TRANSACTION.DIRECTION.CREDIT
      : Enums.TRANSACTION.DIRECTION.DEBIT;

  const ledgerEntry = await WalletLedger.create({
    wallet_id: wallet._id,
    user_id: userId,
    transaction_type: transactionType,
    direction,
    amount: Math.abs(amount),
    final_amount: Math.abs(amount),
    opening_balance: openingBalance,
    closing_balance: closingBalance,
    payment_method: Enums.PAYMENT.METHOD.WALLET,
    payment_provider: Enums.PAYMENT.PROVIDER.ASTROVEDVANNI,
    payment_status: Enums.PAYMENT.STATUS.PAID,
    related_entity_id: relatedEntityId,
    related_entity_type: relatedEntityType,
    remarks,
    timestamp: new Date(),
  });

  logger.info(
    `Wallet updated for user ${userId}. Amount: ${amount}, Opening: ${openingBalance}, Closing: ${closingBalance}`,
  );

  return { wallet, ledger: ledgerEntry };
};

const getWalletBalance = async (userId) => {
  const wallet = await Wallet.findOne({ user_id: userId });
  return wallet ? wallet.balance : 0;
};
module.exports = {
  createWallet,
  creditWallet,
  updateWalletAndLedger,
  getWalletBalance,
};
