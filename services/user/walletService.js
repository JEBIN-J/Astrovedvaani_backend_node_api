const Wallet = require("../../models/Wallet");
const WalletLedger = require("../../models/Ledger");
const ThirdPartyIntegration = require("../../models/ThirdPartyIntegration");
const Razorpay = require("razorpay");
const logger = require("../../utils/logger");
const Enums = require("../../utils/constants");
const { randomUUID } = require("crypto");
const {
  StandardCheckoutClient,
  Env,
  CreateSdkOrderRequest,
  MetaInfo,
  StandardCheckoutPayRequest,
} = require("pg-sdk-node");
const { calculateWithTax } = require("../admin/taxSlabService");
const { getPhonePeClient } = require("../../config/phonepeClient");

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
  userId,
  amount,
  integration,
  wallet,
  bonus = 0,
) {
  const { subtotal, tax, total } = await calculateWithTax(
    amount,
    Enums.SERVICE.TYPE.WALLET_RECHARGE,
  );
  const amountPaise = Math.round(total * 100);
  const razorpay = new Razorpay({
    key_id: integration.api_key,
    key_secret: integration.api_secret,
  });
  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `wallet_rcg_${Date.now()}`,
    notes: { user_id: userId.toString() },
    payment_capture: 1,
  });

  await createLedgerEntry({
    walletId: wallet._id,
    subtotal,
    tax,
    total,
    transactionId: order.id,
    paymentProvider: Enums.PAYMENT.PROVIDER.RAZORPAY,
    bonusAmount: bonus,
  });

  return {
    success: true,
    provider: "RAZORPAY",
    order_id: order.id,
    amount: order.amount / 100,
    currency: order.currency,
    gateway_key: integration.api_key,
    bonusAmount: bonus,
    finalCredit: subtotal + bonus, // total wallet credit
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
  amount,
  provider,
  bonus,
  platform,
  redirectUrl,
) => {
  logger.info(
    `[initiateRecharge] Called | userId=${userId}, provider=${provider} and platform ${platform}`,
  );
  provider = Number(provider);
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

  const wallet = await Wallet.findOne({ user_id: userId });
  if (!wallet) {
    logger.error(`[initiateRecharge] Wallet not found for userId=${userId}`);
    throw new Error("Wallet not found");
  }

  const handler = gatewayHandlers[provider];
  if (!handler) {
    logger.error(`[initiateRecharge] Unsupported provider=${provider}`);
    throw new Error("Unsupported provider");
  }

  logger.info(`[initiateRecharge] Invoking handler for provider=${provider}`);
  return handler(
    userId,
    amount,
    integration,
    wallet,
    bonus,
    platform,
    redirectUrl,
  );
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
