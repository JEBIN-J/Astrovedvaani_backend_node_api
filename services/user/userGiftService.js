const { NotFoundError, BadRequestError } = require("../../errors");
const Gift = require("../../models/Gift");
const Ledger = require("../../models/Ledger");
const Wallet = require("../../models/Wallet");
const UserGift = require("../../models/UserGift");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const { emitGiftSent } = require("../socket/liveSocket");
const { getAdminUserId } = require("../session/userService");
const GIFT_COMMISSION_PCT = 10;
const buyGift = async (userId, giftId, quantity = 1) => {
  const gift = await Gift.findById(giftId);
  if (!gift) {
    logger.info(`Gift not found: ${giftId}`);
    throw new NotFoundError("Gift not found");
  }

  const wallet = await Wallet.findOne({ user_id: userId });
  if (!wallet) {
    logger.info(`Wallet not found for user: ${userId}`);
    throw new NotFoundError("User wallet not found");
  }

  const totalPrice = gift.price * quantity;

  if (wallet.balance < totalPrice) {
    logger.info(
      `Insufficient balance for user: ${userId}, required: ${totalPrice}, available: ${wallet.balance}`,
    );
    throw new BadRequestError("Insufficient wallet balance");
  }

  const openingBalance = wallet.balance;

  wallet.balance = Number((wallet.balance - totalPrice).toFixed(2));
  wallet.last_updated = new Date();
  await wallet.save();

  logger.info(
    `Wallet updated for user: ${userId}, new balance: ${wallet.balance}`,
  );

  const closingBalance = wallet.balance;

  const userGifts = [];
  for (let i = 0; i < quantity; i++) {
    userGifts.push({
      gift_id: gift._id,
      owner_id: userId,
      price: gift.price,
      status: "OWNED",
    });
  }

  const createdUserGifts = await UserGift.insertMany(userGifts);

  logger.info(
    `Created ${createdUserGifts.length} UserGift records for user: ${userId}`,
  );

  const ledger = new Ledger({
    wallet_id: wallet._id,
    transaction_type: Enums.TRANSACTION.TYPE.PURCHASE,
    direction: Enums.TRANSACTION.DIRECTION.DEBIT,
    amount: totalPrice,
    gst_included: false,
    final_amount: totalPrice,
    payment_method: Enums.PAYMENT.METHOD.WALLET,
    payment_status: Enums.PAYMENT.STATUS.PAID,
    related_entity_id: gift._id.toString(),
    related_entity_type: Enums.ENTITY.TYPE.GIFT,
    remarks: `Purchased ${quantity} gift(s): ${gift.name}`,
    metadata: {
      userId,
      giftId,
      quantity,
    },
    opening_balance: openingBalance,
    closing_balance: closingBalance,
  });

  await ledger.save();

  logger.info(
    `Ledger entry created for user: ${userId}, gift: ${giftId}, quantity: ${quantity}, total amount: ${totalPrice}`,
  );

  return {
    message: "Gift(s) purchased successfully",
    walletBalance: wallet.balance,
    gifts: createdUserGifts,
  };
};

const getMyGifts = async (userId) => {
  const gifts = await UserGift.find({ owner_id: userId, status: "OWNED" })
    .populate("gift_id")
    .sort({ createdAt: -1 });

  logger.info(`Fetched ${gifts.length} gifts for user: ${userId}`);

  return gifts;
};

// const sendGift = async (userId, userGiftId, astrologerUserId, sessionId) => {
//   const userGift = await UserGift.findOne({
//     _id: userGiftId,
//     owner_id: userId,
//     status: "OWNED"
//   }).populate("gift_id");

//   if (!userGift) {
//     logger.info(`Gift not found or already used/sent: ${userGiftId}`);
//     throw new NotFoundError("Gift not available to send");
//   }

//   const astroWallet = await Wallet.findOne({ user_id: astrologerUserId });
//   if (!astroWallet) {
//     logger.info(`Wallet not found for astrologer: ${astrologerUserId}`);
//     throw new NotFoundError("Astrologer wallet not found");
//   }

//   // Update UserGift
//   userGift.status = "SENT";
//   userGift.recipient_id = astrologerUserId;
//   userGift.sent_at = new Date();
//   await userGift.save();
//   logger.info(`Gift ${userGiftId} sent by user ${userId} to astrologer ${astrologerUserId}`);

//   // Credit astrologer wallet
//   astroWallet.balance += userGift.price;
//   astroWallet.last_updated = new Date();
//   await astroWallet.save();
//   logger.info(`Astrologer wallet credited: ${astroWallet._id}, new balance: ${astroWallet.balance}`);

//   // Ledger debit for sender
//   const senderLedger = new Ledger({
//     wallet_id: (await Wallet.findOne({ user_id: userId }))._id,
//     transaction_type: Enums.TRANSACTION.TYPE.GIFT_SEND,
//     direction: Enums.TRANSACTION.DIRECTION.DEBIT,
//     amount: userGift.price,
//     final_amount: userGift.price,
//     payment_method: Enums.PAYMENT.METHOD.WALLET,
//     payment_status: Enums.PAYMENT.STATUS.PAID,
//     related_entity_id: userGift._id.toString(),
//     related_entity_type: Enums.ENTITY.TYPE.GIFT,
//     remarks: `Sent gift: ${userGift.gift_id.name} to astrologer ${astrologerUserId}`,
//     metadata: { userId, astrologerUserId, giftId: userGift.gift_id._id }
//   });
//   await senderLedger.save();

//   // Ledger credit for astrologer
//   const astroLedger = new Ledger({
//     wallet_id: astroWallet._id,
//     transaction_type: Enums.TRANSACTION.TYPE.GIFT_RECEIVE,
//     direction: Enums.TRANSACTION.DIRECTION.CREDIT,
//     amount: userGift.price,
//     final_amount: userGift.price,
//     payment_method: Enums.PAYMENT.METHOD.WALLET,
//     payment_status: Enums.PAYMENT.STATUS.PAID,
//     related_entity_id: userGift._id.toString(),
//     related_entity_type: Enums.ENTITY.TYPE.GIFT,
//     remarks: `Received gift: ${userGift.gift_id.name} from user ${userId}`,
//     metadata: { userId, astrologerUserId, giftId: userGift.gift_id._id }
//   });
//   await astroLedger.save();
//  if (sessionId) {
//     await emitGiftSent({ sessionId, userId, astrologerUserId, userGift });
//   }
//   return { message: "Gift sent successfully" };
// };
const sendGift = async (userId, userGiftId, astrologerUserId, sessionId) => {
  const userGift = await UserGift.findOne({
    _id: userGiftId,
    owner_id: userId,
    status: "OWNED",
  }).populate("gift_id");

  if (!userGift) {
    throw new NotFoundError("Gift not available to send");
  }

  const [astroWallet, userWallet] = await Promise.all([
    Wallet.findOne({ user_id: astrologerUserId }),
    Wallet.findOne({ user_id: userId }),
  ]);

  const superAdminUserId = await getAdminUserId();
  const superAdminWallet = await Wallet.findOne({ user_id: superAdminUserId });

  if (!astroWallet || !userWallet || !superAdminWallet) {
    throw new Error("Wallet not found");
  }

  /* ================= COMMISSION SPLIT ================= */

  const totalAmount = Number(userGift.price.toFixed(2));
  const commissionAmount = Number(
    ((GIFT_COMMISSION_PCT / 100) * totalAmount).toFixed(2),
  );
  const astrologerAmount = Number((totalAmount - commissionAmount).toFixed(2));

  /* ================= UPDATE GIFT ================= */

  userGift.status = "SENT";
  userGift.recipient_id = astrologerUserId;
  userGift.sent_at = new Date();
  if (sessionId) userGift.live_session_id = sessionId;
  await userGift.save();

  /* ================= OPENING / CLOSING BALANCES ================= */

  // Sender (no balance change)
  const userOpen = userWallet.balance;
  const userClose = userOpen;

  // Astrologer
  const astroOpen = astroWallet.balance;
  const astroClose = Number((astroOpen + astrologerAmount).toFixed(2));

  // Super Admin
  const superAdminOpen = superAdminWallet.balance;
  const superAdminClose = Number(
    (superAdminOpen + commissionAmount).toFixed(2),
  );

  astroWallet.balance = astroClose;
  superAdminWallet.balance = superAdminClose;

  await Promise.all([astroWallet.save(), superAdminWallet.save()]);

  /* ================= LEDGER ENTRIES ================= */

  const timestamp = new Date();

  await Ledger.create([
    // USER ledger (debit – balance unchanged)
    {
      wallet_id: userWallet._id,
      transaction_type: Enums.TRANSACTION.TYPE.GIFT_SENT,
      direction: Enums.TRANSACTION.DIRECTION.DEBIT,
      amount: totalAmount,
      final_amount: totalAmount,
      opening_balance: userOpen,
      closing_balance: userClose,
      payment_method: Enums.PAYMENT.METHOD.WALLET,
      payment_status: Enums.PAYMENT.STATUS.PAID,
      related_entity_id: sessionId ? sessionId.toString() : null,
      related_entity_type: Enums.ENTITY.TYPE.SESSION,
      remarks: `Sent gift: ${userGift.gift_id.name}`,
      timestamp,
    },

    // ASTROLOGER ledger (credit)
    {
      wallet_id: astroWallet._id,
      transaction_type: Enums.TRANSACTION.TYPE.EARNING,
      direction: Enums.TRANSACTION.DIRECTION.CREDIT,
      amount: astrologerAmount,
      final_amount: astrologerAmount,
      opening_balance: astroOpen,
      closing_balance: astroClose,
      payment_method: Enums.PAYMENT.METHOD.WALLET,
      payment_status: Enums.PAYMENT.STATUS.PAID,
      related_entity_id: sessionId ? sessionId.toString() : null,
      related_entity_type: Enums.ENTITY.TYPE.SESSION,
      remarks: `Gift received (${100 - GIFT_COMMISSION_PCT}% share)`,
      timestamp,
    },

    // SUPER ADMIN ledger (commission)
    {
      wallet_id: superAdminWallet._id,
      transaction_type: Enums.TRANSACTION.TYPE.EARNING,
      direction: Enums.TRANSACTION.DIRECTION.CREDIT,
      amount: commissionAmount,
      final_amount: commissionAmount,
      opening_balance: superAdminOpen,
      closing_balance: superAdminClose,
      payment_method: Enums.PAYMENT.METHOD.WALLET,
      payment_status: Enums.PAYMENT.STATUS.PAID,
      related_entity_id: sessionId ? sessionId.toString() : null,
      related_entity_type: Enums.ENTITY.TYPE.SESSION,
      remarks: `Gift commission (${GIFT_COMMISSION_PCT}%)`,
      timestamp,
    },
  ]);

  if (sessionId) {
    await emitGiftSent({
      sessionId,
      userId,
      astrologerUserId,
      userGift,
      astrologerAmount,
    });
  }

  return { message: "Gift sent successfully" };
};

module.exports = {
  buyGift,
  getMyGifts,
  sendGift,
};
