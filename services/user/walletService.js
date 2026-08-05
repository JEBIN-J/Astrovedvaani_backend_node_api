const Wallet = require("../../models/Wallet");
const WalletLedger = require("../../models/Ledger");
const ThirdPartyIntegration = require("../../models/ThirdPartyIntegration");
const Razorpay = require("razorpay");
const logger = require("../../utils/logger");
const Enums = require("../../utils/constants");
const { randomUUID } = require("crypto");
// const {
//   StandardCheckoutClient,
//   Env,
//   CreateSdkOrderRequest,
//   MetaInfo,
//   StandardCheckoutPayRequest,
// } = require("pg-sdk-node");
const { calculateWithTax } = require("../admin/taxSlabService");
const { getPhonePeClient } = require("../../config/phonepeClient");
const TaxSlab = require("../../models/TaxSlab");
const rechargeCard = require("../../models/rechargeCard");
const Coupon = require("../../models/Coupan");
const ApiError = require("../../errors/apiError");

exports.getWalletBalance = async (userId) => {
  logger.info("getWalletBalance: Fetching wallet balance", { userId });
  const wallet = await Wallet.findOne({ user_id: userId });
  if (!wallet) throw new Error("Wallet not found");
  return wallet.balance;
};
async function createLedgerEntry({
  walletId,
  subtotal,
  tax,
  total,
  transactionId,
  paymentProvider,
  paymentMethod = Enums.PAYMENT.METHOD.UPI,
  remarks,
  bonusAmount = 0,
  externalTransactionId = null,
}) {
  const wallet = await Wallet.findById(walletId).lean();
  if (!wallet) {
    throw new Error("Wallet not found");
  }
  const openingBalance = wallet.balance;
  const creditAmount = subtotal + bonusAmount;
  const closingBalance = openingBalance + creditAmount;
  const ledger = {
    wallet_id: walletId,
    transaction_type: Enums.TRANSACTION.TYPE.RECHARGE,
    direction: Enums.TRANSACTION.DIRECTION.CREDIT,
    amount: subtotal,
    gst_included: true,
    gst_percent: tax > 0 ? (tax * 100) / subtotal : 0,
    final_amount: total,
    bonus_amount: bonusAmount,
    credit_amount: creditAmount,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
    payment_method: paymentMethod,
    payment_provider: paymentProvider,
    payment_status: Enums.PAYMENT.STATUS.PENDING,
    external_transaction_id: externalTransactionId,
    related_entity_id: transactionId,
    related_entity_type: Enums.ENTITY.TYPE.ORDER,
    remarks:
      remarks ||
      `Recharge initiated - ${paymentProvider} (subtotal ₹${subtotal}, tax ₹${tax}, bonus ₹${bonusAmount})`,
    timestamp: new Date(),
  };
  try {
    await WalletLedger.create(ledger);
    logger.info("Ledger entry created", {
      transactionId,
      walletId,
      openingBalance,
      closingBalance,
    });
  } catch (err) {
    logger.error("Failed to create ledger entry", {
      transactionId,
      error: err,
    });
    throw err;
  }

  return ledger;
}
async function handleRazorpayRecharge(
  provider,
  userId,
  base_amount,
  gst_amount,
  final_amount,
  wallet,
  couponCode = null,
  discountAmount = 0,
  gst_percent = 0,
  direction,
  transaction_type,
  bonus = 0,
  is_applicable = false,
  rechargeCardId = null,
) {
  console.log("✅ Razorpay Recharge Details", {
    base_amount,
    gst_percent,
    gst_amount,
    final_amount,
    bonus,
    discountAmount,
    rechargeCardId,
  });

  const integration = await ThirdPartyIntegration.findOne({
    provider,
    type: Enums.INTEGRATION.TYPE.PAYMENT,
    is_active: true,
  });

  if (!integration) {
    logger.error(
      `[initiateRecharge] Payment gateway not configured for provider=${provider}`,
    );
    throw new Error("Payment gateway not configured");
  }

  console.log("🔹 Found Razorpay Integration:", integration);

  const razorpay = new Razorpay({
    key_id: integration.api_key,
    key_secret: integration.api_secret,
  });

  //  Create Razorpay order
  const order = await razorpay.orders.create({
    amount: Math.round(final_amount * 100), // paise
    currency: "INR",
    receipt: `wallet_rcg_${Date.now()}`,
    notes: {
      user_id: userId.toString(),
      coupon_code: couponCode || null,
      discount_amount: discountAmount,
      gst_percent,
      gst_amount,
      base_amount,
      final_amount,
      bonus_amount: bonus,
      recharge_card_id: rechargeCardId ? rechargeCardId.toString() : null, // ← NEW
      // coins_credited: coins, // added
    },
  });

  const gateway_key = integration.api_key;

  const openingBalance = wallet.balance;
  const closingBalance = wallet.balance;

  const ledger = await WalletLedger.create({
    wallet_id: wallet._id,
    transaction_type,
    direction,
    amount: base_amount,
    gst_included: true,
    gst_percent,
    credit_amount: base_amount + bonus,
    final_amount,
    payment_method: Enums.PAYMENT.METHOD.UPI,
    payment_provider: Enums.PAYMENT.PROVIDER.RAZORPAY,
    payment_status: Enums.PAYMENT.STATUS.PENDING,
    related_entity_id: order.id,
    related_entity_type: Enums.ENTITY.TYPE.ORDER,
    metadata: {
      coupon_code: couponCode || null,
      discount_amount: discountAmount,
      gst_amount,
      original_amount: base_amount,
      is_applicable,
      recharge_card_id: rechargeCardId || null,
    },
    bonus_amount: bonus,
    // coins_credited: coins,
    remarks: `Recharge initiated - waiting for confirmation${
      couponCode ? ` (Coupon: ${couponCode})` : ""
    }`,
    timestamp: new Date(),

    opening_balance: openingBalance,
    closing_balance: closingBalance,
  });

  return {
    success: true,
    provider: "RAZORPAY",
    order_id: order.id,
    currency: "INR",
    gateway_key,
    amount_payable: final_amount,
    base_amount,
    gst_percent,
    gst_amount,
    discount_amount: discountAmount,
    bonus_amount: bonus,
    // coins_credited: coins, // new
    total_wallet_credit: base_amount + bonus, //  You get this in wallet
    coupon_applied: !!couponCode && is_applicable,
    ledger_id: ledger._id,
  };
}
// async function handlePhonePeRecharge(
//   userId,
//   amount,
//   integration,
//   wallet,
//   bonus = 0,
//   platform = "web"
// ) {
//   logger.info(
//     `[PhonePeRecharge] Start | userId=${userId}, amount=${amount}, bonus=${bonus}, platform=${platform}`
//   );

//   const { subtotal, tax, total } = await calculateWithTax(
//     amount,
//     Enums.SERVICE.TYPE.WALLET_RECHARGE
//   );
//   logger.info(
//     `[PhonePeRecharge] Tax Calculated | subtotal=${subtotal}, tax=${tax}, total=${total}`
//   );

//   try {
//     // ✅ Get global PhonePe SDK client
//     const client = getPhonePeClient();
//     if (!client) throw new Error("PhonePe client not initialized");

//     const merchantOrderId = randomUUID();
//     const merchantId = integration.merchant_id;
//     const redirectUrl =
//       integration.extra_config?.redirect_url ||
//       "https://astrowala.ai/recharge";
//     const callbackUrl =
//       integration.extra_config?.callback_url ||
//       "https://api.astrowala.ai/api/payment/webhook/phonepe";

//     const metaInfo = MetaInfo.builder()
//       .udf1(`userId_${userId}`)
//       .udf2(callbackUrl)
//       .build();

//     let response;

//     // ✅ APP Flow → return token
//     if (platform === "app") {
//       const request = CreateSdkOrderRequest.StandardCheckoutBuilder()
//         .merchantOrderId(merchantOrderId)
//         .amount(total * 100)
//         .redirectUrl(redirectUrl)
//         .metaInfo(metaInfo)
//         .build();

//       response = await client.createSdkOrder(request);
//       logger.info(
//         `[PhonePeRecharge] SDK Order Created for APP | token=${response.token}`
//       );

//       await createLedgerEntry({
//         walletId: wallet._id,
//         subtotal,
//         tax,
//         total,
//         transactionId: merchantOrderId,
//         paymentProvider: Enums.PAYMENT.PROVIDER.PHONEPE,
//         bonusAmount: bonus,
//       });

//       return {
//         success: true,
//         provider: "PHONEPE",
//         order_id: merchantOrderId,
//         amount: total,
//         currency: "INR",
//         merchant_id: merchantId,
//         token: response.token, // for APP
//         bonusAmount: bonus,
//         finalCredit: subtotal + bonus, // total wallet credit after bonus
//       };
//     }

//     // ✅ WEB Flow → return redirect URL
//     const request = CreateSdkOrderRequest.StandardCheckoutBuilder()
//       .merchantOrderId(merchantOrderId)
//       .amount(total * 100)
//       .redirectUrl(redirectUrl)
//       .metaInfo(metaInfo)
//       .build();

//     response = await client.pay(request);
//     logger.info(
//       `[PhonePeRecharge] Web Order Created | redirectUrl=${response.redirectUrl}`
//     );

//     await createLedgerEntry({
//       walletId: wallet._id,
//       subtotal,
//       tax,
//       total,
//       transactionId: response.orderId,
//       paymentProvider: Enums.PAYMENT.PROVIDER.PHONEPE,
//       bonusAmount: bonus,
//     });

//     return {
//       success: true,
//       provider: "PHONEPE",
//       order_id: response.orderId,
//       amount: total,
//       currency: "INR",
//       merchant_id: merchantId,
//       redirect_url: response.redirectUrl,
//       bonusAmount: bonus,
//       finalCredit: subtotal + bonus,
//     };
//   } catch (err) {
//     logger.error(
//       `[PhonePeRecharge] Failed | userId=${userId}, error=${err.message}`,
//       err
//     );
//     throw err;
//   }
// }
async function handlePhonePeRecharge(
  userId,
  amount,
  integration,
  wallet,
  bonus = 0,
  platform = "web",
  redirectUrlParam,
) {
  logger.info(
    `[PhonePeRecharge] Start | userId=${userId}, amount=${amount}, bonus=${bonus}, platform=${platform}`,
  );

  const { subtotal, tax, total } = await calculateWithTax(
    amount,
    Enums.SERVICE.TYPE.WALLET_RECHARGE,
  );
  logger.info(
    `[PhonePeRecharge] Tax Calculated | subtotal=${subtotal}, tax=${tax}, total=${total}`,
  );

  try {
    const client = getPhonePeClient();
    if (!client) throw new Error("PhonePe client not initialized");

    const merchantOrderId = randomUUID();
    const merchantId = integration.merchant_id;

    const redirectUrl =
      redirectUrlParam ||
      integration.extra_config?.redirect_url ||
      "https://astrowala.ai/recharge";

    const callbackUrl =
      integration.extra_config?.callback_url ||
      "https://api.astrowala.ai/api/payment/webhook/phonepe";

    const metaInfo = MetaInfo.builder()
      .udf1(`userId_${userId}`)
      .udf2(callbackUrl)
      .build();

    let response;

    // APP flow → return token
    if (platform === "app") {
      const request = CreateSdkOrderRequest.StandardCheckoutBuilder()
        .merchantOrderId(merchantOrderId)
        .amount(total * 100)
        .redirectUrl(redirectUrl)
        .metaInfo(metaInfo)
        .build();

      response = await client.createSdkOrder(request);
      logger.info(
        `[PhonePeRecharge] SDK Order Created for APP | token=${JSON.stringify(
          response,
        )}`,
      );

      await createLedgerEntry({
        walletId: wallet._id,
        subtotal,
        tax,
        total,
        transactionId: merchantOrderId,
        paymentProvider: Enums.PAYMENT.PROVIDER.PHONEPAY,
        bonusAmount: bonus,
        externalTransactionId: response.orderId, // match signature
      });

      return {
        success: true,
        provider: "PHONEPE",
        order_id: merchantOrderId,
        amount: total,
        currency: "INR",
        merchant_id: merchantId,
        token: response.token,
        bonusAmount: bonus,
        finalCredit: subtotal + bonus,
      };
    }

    // WEB flow → return redirect URL
    const request = CreateSdkOrderRequest.StandardCheckoutBuilder()
      .merchantOrderId(merchantOrderId)
      .amount(total * 100)
      .redirectUrl(redirectUrl)
      .metaInfo(metaInfo)
      .build();

    response = await client.pay(request);
    logger.info(
      `[PhonePeRecharge] Web Order Created | redirectUrl=${JSON.stringify(
        response,
      )}`,
    );

    await createLedgerEntry({
      walletId: wallet._id,
      subtotal,
      tax,
      total,
      transactionId: merchantOrderId,
      paymentProvider: Enums.PAYMENT.PROVIDER.PHONEPAY,
      bonusAmount: bonus,
      externalTransactionId: response.orderId,
    });

    return {
      success: true,
      provider: "PHONEPE",
      order_id: response.orderId,
      amount: total,
      currency: "INR",
      merchant_id: merchantId,
      redirect_url: response.redirectUrl,
      bonusAmount: bonus,
      finalCredit: subtotal + bonus,
    };
  } catch (err) {
    logger.error(
      `[PhonePeRecharge] Failed | userId=${userId}, error=${err.message}`,
      err,
    );
    throw err;
  }
}

const gatewayHandlers = {
  [Enums.INTEGRATION.PROVIDER.RAZORPAY]: handleRazorpayRecharge,
  [Enums.INTEGRATION.PROVIDER.PHONEPAY]: handlePhonePeRecharge,
};

exports.initiateRecharge = async (
  userId,
  rechargeCardId,
  provider,
  couponCode = null,
  direction = Enums.TRANSACTION.DIRECTION.CREDIT,
  transaction_type = Enums.TRANSACTION.TYPE.RECHARGE,
) => {
  try {
    logger.info(
      `[initiateRecharge] Called | userId=${userId}, provider=${provider}, rechargeCardId=${rechargeCardId}, couponCode=${couponCode}`,
    );

    provider = Number(provider);

    // ✅ Wallet
    const wallet = await Wallet.findOne({ user_id: userId });
    if (!wallet) throw new ApiError("Wallet not found", 404);

    // ✅ Card
    const card = await rechargeCard.findById(rechargeCardId);
    if (!card || !card.is_active)
      throw new ApiError("Invalid or inactive recharge card", 400);

    const base_amount = card.amount;

    let discountAmount = 0;
    let bonus = 0;
    let final_amount = base_amount;
    let coupon = null;

    // =========================
    // ✅ COUPON LOGIC
    // =========================
    if (couponCode) {
      if (!card.is_applicable)
        throw new ApiError("Coupon not allowed on this card", 400);

      coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
        is_active: true,
        valid_from: { $lte: new Date() },
        valid_until: { $gte: new Date() },
      });

      if (!coupon) throw new ApiError("Invalid coupon", 400);

      if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit)
        throw new ApiError("Coupon usage limit exceeded", 400);

      const alreadyUsed = await WalletLedger.findOne({
        "metadata.coupon_code": couponCode.toUpperCase(),
        wallet_id: wallet._id,
        payment_status: Enums.PAYMENT.STATUS.PAID,
      });

      if (alreadyUsed) throw new ApiError(`Coupon already used`, 400);

      if (base_amount < coupon.min_cart_value)
        throw new ApiError(
          `Minimum recharge ₹${coupon.min_cart_value} required`,
          400,
        );

      let couponValue =
        coupon.discount_type === "percentage"
          ? (coupon.discount_value * base_amount) / 100
          : coupon.discount_value;

      // ❗ FIX: coupon cannot exceed amount
      couponValue = Math.min(couponValue, base_amount);

      if (coupon.coupon_mode === "OFF") {
        discountAmount += couponValue;
        final_amount -= couponValue;
      } else {
        bonus += couponValue;
      }
    }

    // =========================
    // ✅ CARD LOGIC
    // =========================
    if (card.card_mode === "OFF") {
      let cardDiscount =
        card.discount_type === "percentage"
          ? (card.bonus * base_amount) / 100
          : card.bonus;

      // ❗ FIX: discount cannot exceed amount
      cardDiscount = Math.min(cardDiscount, final_amount);

      discountAmount += cardDiscount;
      final_amount -= cardDiscount;
    } else if (card.card_mode === "EXTRA") {
      let cardBonus =
        card.discount_type === "percentage"
          ? (card.bonus * base_amount) / 100
          : card.bonus;

      bonus += cardBonus;
    }

    // ❗ FINAL SAFETY
    final_amount = Math.max(final_amount, 0);

    // =========================
    // ✅ TAX
    // =========================
    const taxSlab = await TaxSlab.findOne({
      isActive: true,
      taxContext: Enums?.TAX?.CONTEXT?.WALLET,
    });

    const gst_percent = taxSlab ? taxSlab.rate : 0;
    const gst_amount = (base_amount * gst_percent) / 100;

    final_amount += gst_amount;

    // ❗ Razorpay ke liye minimum amount
    if (final_amount <= 0) {
      throw new ApiError("Final payable amount must be greater than 0", 400);
    }

    // =========================
    // ✅ LOG SUMMARY
    // =========================
    console.table({
      base_amount,
      gst_percent,
      gst_amount,
      final_amount,
      discountAmount,
      bonus,
      coupon: coupon?.code || "N/A",
    });

    // =========================
    // ✅ RAZORPAY
    // =========================
    if (provider === Enums.INTEGRATION.PROVIDER.RAZORPAY) {
      return await handleRazorpayRecharge(
        provider,
        userId,
        base_amount,
        gst_amount,
        final_amount,
        wallet,
        couponCode,
        discountAmount,
        gst_percent,
        direction,
        transaction_type,
        bonus,
        card.is_applicable,
        card._id, // ← NEW: pass the recharge card's _id through so the
        // ledger entry created inside handleRazorpayRecharge can record
        // which card was used (needed for the admin dashboard's
        // per-card bonus % breakdown).
      );
    }

    throw new ApiError("Unsupported payment provider", 400);
  } catch (error) {
    console.error("❌ ERROR in initiateRecharge:", error);
    throw error;
  }
};

exports.confirmRecharge = async (userId, paymentInfo) => {
  const { order_id, payment_id, amount, provider, method } = paymentInfo;
  if (!order_id || !payment_id) {
    throw new Error("Missing required payment confirmation details");
  }
  const ledger = await WalletLedger.findOne({
    related_entity_id: order_id,
    related_entity_type: Enums.ENTITY.TYPE.ORDER,
  });
  if (!ledger) {
    throw new Error("Ledger not found for this order");
  }
  const wallet = await Wallet.findById(ledger.wallet_id);
  if (!wallet) {
    throw new Error("Wallet not found");
  }
  const response = {
    userId,
    orderId: order_id,
    paymentId: payment_id,
    provider: provider || ledger.provider || "razorpay",
    method: method || ledger.method || "razorpay",
    amount: amount || ledger.amount,
    ledgerStatus: ledger.payment_status,
    oldBalance:
      ledger.payment_status === Enums.PAYMENT.STATUS.PAID
        ? wallet.balance - ledger.amount
        : wallet.balance,
    newBalance: wallet.balance,
    rechargeAmount: ledger.amount,
  };
  logger.info("confirmRecharge: Lookup result", response);
  return response;
};
