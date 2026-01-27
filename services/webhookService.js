const crypto = require("crypto");
const Wallet = require("../models/Wallet");
const WalletLedger = require("../models/Ledger");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");
const Razorpay = require('razorpay');
const ThirdPartyIntegration = require("../models/ThirdPartyIntegration");
const User = require("../models/User");
const axios = require("axios");
const redisClient = require("../utils/redis/redisClient");
const walletNotification = require('../services/socket/walletNotification');
const { getPhonePeClient } = require("../config/phonepeClient");

exports.handleRazorpayWebhook = async (req) => {
  const provider = Enums.INTEGRATION.PROVIDER.RAZORPAY;
  const redisKey = `razorpay_webhook_secret_${provider}`;

  logger.info(`[Debug] Incoming webhook for provider=${provider}`);
  logger.debug(`[Debug] Headers: ${JSON.stringify(req.headers)}`);
  logger.debug(`[Debug] Raw body: ${req.body.toString("utf8")}`);

  let secret = await redisClient.get(redisKey);
  if (!secret) {
    logger.info(`[Cache] Secret not found in Redis, fetching from DB...`);
    const integration = await ThirdPartyIntegration.findOne({
      provider,
      type: Enums.INTEGRATION.TYPE.PAYMENT,
      is_active: true,
    });
    if (!integration || !integration.extra_config?.webhook_secret) {
      logger.error("Razorpay webhook secret not configured");
      throw new Error("Webhook secret missing");
    }
    secret = integration.extra_config.webhook_secret;
    await redisClient.setEx(redisKey, 3600, secret);
    logger.info(`[Cache] Webhook secret cached in Redis`);
  } else {
    logger.info(`[Cache] Webhook secret found in Redis`);
  }

  const signature = req.headers["x-razorpay-signature"];
  const body = req.body.toString("utf8");
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  if (signature !== expectedSignature) {
    logger.error("Invalid Razorpay signature", { signature, expectedSignature });
    throw new Error("Invalid Razorpay signature");
  }

  logger.info("Signature validation passed");
  const payload = JSON.parse(body);
  const payment = payload.payload?.payment?.entity;
  const event = payload.event;

  if (!payment) {
    logger.error("Webhook payload missing payment entity", { payload });
    return;
  }

  const { order_id, id: payment_id, amount, status } = payment;
  logger.info(
    `Webhook event received: event=${event}, order_id=${order_id}, payment_id=${payment_id}, status=${status}, amount=${amount / 100}`
  );

  const ledger = await WalletLedger.findOne({
    related_entity_id: order_id,
    related_entity_type: Enums.ENTITY.TYPE.ORDER,
    payment_status: Enums.PAYMENT.STATUS.PENDING,
  });

  if (!ledger) {
    logger.info(
      `ℹLedger already processed or not found for order_id=${order_id}, skipping update`
    );
    return;
  }

  if (status === "failed") {
    ledger.external_transaction_id = payment_id;
    ledger.payment_status = Enums.PAYMENT.STATUS.FAILED;
    ledger.remarks = "Recharge failed via Razorpay Webhook";
    ledger.timestamp = new Date();
    await ledger.save();

    logger.info(
      `Ledger updated as FAILED: ledgerId=${ledger._id}, walletId=${ledger.wallet_id}, amount=${ledger.amount}`
    );

    const wallet = await Wallet.findById(ledger.wallet_id);
    if (wallet) {
      walletNotification.emitWalletUpdate(
        wallet.user_id.toString(),
        ledger.amount,
        wallet.balance,
        wallet.balance,
        'failed'
      );
    }
    return;
  }

if (status === "captured") {
  ledger.external_transaction_id = payment_id;
  ledger.payment_status = Enums.PAYMENT.STATUS.PAID;
  ledger.remarks = "Recharge confirmed via Razorpay Webhook";
  ledger.timestamp = new Date();
  await ledger.save();

  const wallet = await Wallet.findById(ledger.wallet_id);
  if (!wallet) throw new Error("Wallet not found");
  const oldBalance = wallet.balance;
  const rechargeAmount = ledger.credit_amount;
  logger.info(
    `Wallet before update: walletId=${wallet._id}, oldBalance=${oldBalance}, rechargeAmount=${rechargeAmount}`
  );

  wallet.balance += rechargeAmount;
  wallet.last_updated = new Date();
  await wallet.save();

  logger.info(
    `Wallet after update: walletId=${wallet._id}, newBalance=${wallet.balance}, rechargeAmount=${rechargeAmount}`
  );

  walletNotification.emitWalletUpdate(
    wallet.user_id.toString(),
    rechargeAmount,
    oldBalance,
    wallet.balance,
    'success'
  );
}
 else {
    logger.info(
      `ℹPayment status=${status}, no wallet update performed. paymentId=${payment_id}`
    );
  }
};
// exports.handlePhonepeWebhook = async (req) => {
//   try {
//     const rawBody = req.body;
//     const headers = req.headers;

//     logger.info("[PhonePeWebhook] Received Headers:", headers);
//     logger.debug("[PhonePeWebhook] Raw Body:", rawBody.toString("utf8"));

//     const authorization = headers["authorization"];
//     if (!authorization) {
//       logger.error("[PhonePeWebhook] Missing Authorization header");
//       throw new Error("Missing Authorization header");
//     }

//     const provider = Enums.INTEGRATION.PROVIDER.PHONEPAY;
//     const redisKey = `phonepe_webhook_credentials_${provider}`;
//     let credentials = await redisClient.get(redisKey);
//     if (credentials) {
//       credentials = JSON.parse(credentials);
//       logger.info(`[Cache] PhonePe webhook credentials found in Redis`);
//     } else {
//       logger.info(`[Cache] Credentials not found in Redis, fetching from DB...`);
//       const integration = await ThirdPartyIntegration.findOne({
//         provider,
//         type: Enums.INTEGRATION.TYPE.PAYMENT,
//         is_active: true,
//       });
//       if (!integration || !integration.extra_config?.username || !integration.extra_config?.password) {
//         logger.error("[PhonePeWebhook] Integration username/password missing");
//         throw new Error("PhonePe webhook credentials missing in DB");
//       }
//       credentials = {
//         username: integration.extra_config.username,
//         password: integration.extra_config.password,
//       };
//       await redisClient.setEx(redisKey, 3600, JSON.stringify(credentials));
//       logger.info(`[Cache] PhonePe webhook credentials cached in Redis`);
//     }
//     const { username, password } = credentials;
//     const client = getPhonePeClient();
//     logger.info("[PhonePeWebhook] PhonePe Client Initialized");
//     const callbackResponse = client.validateCallback(
//       username,
//       password,
//       authorization,
//       rawBody.toString("utf8")
//     );
//     logger.info("[PhonePeWebhook] Callback Validated Successfully", callbackResponse);
//     const { type, payload } = callbackResponse;
//     const { originalMerchantOrderId, orderId, merchantId, state, amount, errorCode, detailedErrorCode } = payload;
//     logger.info(`[PhonePeWebhook] Parsed Payload:
//       type=${type}
//       orderId=${orderId}
//       originalMerchantOrderId=${originalMerchantOrderId}
//       merchantId=${merchantId}
//       state=${state}
//       amount=${amount}
//       errorCode=${errorCode}
//       detailedErrorCode=${detailedErrorCode}
//     `);
//     const ledger = await WalletLedger.findOne({
//       transaction_id: originalMerchantOrderId,
//       payment_status: Enums.PAYMENT.STATUS.PENDING,
//     });
//     logger.info("[PhonePeWebhook] Ledger Lookup Result:", ledger);

//     if (!ledger) {
//       logger.warn(`[PhonePeWebhook] Ledger not found for ${originalMerchantOrderId}`);
//       return { success: false, message: "Ledger not found" };
//     }

//     // ✅ Fetch wallet
//     const wallet = await Wallet.findById(ledger.wallet_id);
//     logger.info("[PhonePeWebhook] Wallet Fetched:", wallet);
//     if (!wallet) throw new Error("Wallet not found");

//     const oldBalance = wallet.balance;
//     const rechargeAmount = amount / 100;

//     // ✅ Handle success
//     if (state === "COMPLETED" || type === "CHECKOUT_ORDER_COMPLETED") {
//       wallet.balance += rechargeAmount;
//       wallet.last_updated = new Date();
//       await wallet.save();

//       ledger.external_transaction_id = orderId;
//       ledger.payment_status = Enums.PAYMENT.STATUS.PAID;
//       ledger.remarks = "Recharge confirmed via PhonePe webhook";
//       ledger.timestamp = new Date();
//       await ledger.save();

//       const finalCredit = ledger.total + (ledger.bonusAmount || 0);

//       walletNotification.emitWalletUpdate(
//         wallet.user_id.toString(),
//         rechargeAmount,
//         oldBalance,
//         wallet.balance,
//         "success"
//       );

//       logger.info(`[PhonePeWebhook] Payment SUCCESS:
//         walletId=${wallet._id}
//         oldBalance=${oldBalance}
//         newBalance=${wallet.balance}
//         finalCredit=${finalCredit}
//         ledgerId=${ledger._id}
//       `);
//     } else {
//       // ✅ Handle failure
//       ledger.payment_status = Enums.PAYMENT.STATUS.FAILED;
//       ledger.remarks = `Recharge failed (state=${state}, code=${errorCode}, detailedCode=${detailedErrorCode})`;
//       ledger.timestamp = new Date();
//       await ledger.save();

//       logger.warn(`[PhonePeWebhook] Payment FAILED:
//         ledgerId=${ledger._id}
//         state=${state}
//         code=${errorCode}
//         detailedCode=${detailedErrorCode}
//       `);
//     }

//     logger.info(`[PhonePeWebhook] Ledger updated successfully | ledgerId=${ledger._id}, status=${ledger.payment_status}`);
//     return { success: true };
//   } catch (error) {
//     logger.error("[PhonePeWebhook] Error processing webhook:", error);
//     throw error;
//   }
// };

// exports.handlePhonepeWebhook = async (req) => {
//   try {
//     const rawBody = req.body;
//     const headers = req.headers;

//     logger.info("[PhonePeWebhook] Received Headers:", headers);
//     logger.debug("[PhonePeWebhook] Raw Body:", rawBody.toString("utf8"));

//     const authorization = headers["authorization"];
//     if (!authorization) throw new Error("Missing Authorization header");

//     const provider = Enums.INTEGRATION.PROVIDER.PHONEPAY;
//     const redisKey = `phonepe_webhook_credentials_${provider}`;
//     let credentials = await redisClient.get(redisKey);

//     if (credentials) {
//       credentials = JSON.parse(credentials);
//       logger.info("[Cache] PhonePe webhook credentials found in Redis");
//     } else {
//       logger.info("[Cache] Credentials not found in Redis, fetching from DB...");
//       const integration = await ThirdPartyIntegration.findOne({
//         provider,
//         type: Enums.INTEGRATION.TYPE.PAYMENT,
//         is_active: true,
//       });
//       if (!integration || !integration.extra_config?.username || !integration.extra_config?.password) {
//         logger.error("[PhonePeWebhook] Integration username/password missing");
//         throw new Error("PhonePe webhook credentials missing in DB");
//       }
//       credentials = {
//         username: integration.extra_config.username,
//         password: integration.extra_config.password,
//       };
//       await redisClient.setEx(redisKey, 3600, JSON.stringify(credentials));
//       logger.info("[Cache] PhonePe webhook credentials cached in Redis");
//     }

//     const { username, password } = credentials;

//     const client = getPhonePeClient();
//     logger.info("[PhonePeWebhook] PhonePe Client Initialized");

//     const callbackResponse = client.validateCallback(
//       username,
//       password,
//       authorization,
//       rawBody.toString("utf8")
//     );

//     logger.info("[PhonePeWebhook] Callback Validated Successfully", callbackResponse);

//     const { type, payload } = callbackResponse;
//     const { orderId, state, amount, errorCode, detailedErrorCode } = payload;

//     logger.info(
//       `[PhonePeWebhook] Parsed Payload: type=${type}, orderId=${orderId}, state=${state}, amount=${amount}`
//     );

//     // 🔹 Lookup ledger using external_transaction_id
//     const ledger = await WalletLedger.findOne({
//       external_transaction_id: orderId,
//       payment_status: Enums.PAYMENT.STATUS.PENDING,
//     });

//     if (!ledger) {
//       logger.warn(`[PhonePeWebhook] Ledger not found for orderId=${orderId}`);
//       return { success: false, message: "Ledger not found" };
//     }

//     const wallet = await Wallet.findById(ledger.wallet_id);
//     if (!wallet) throw new Error("Wallet not found");

//     const oldBalance = wallet.balance;
//     const rechargeAmount = amount / 100;
//     const bonusAmount = ledger.bonus_amount || 0;

//     if (state === "COMPLETED" || type === "CHECKOUT_ORDER_COMPLETED") {
//       wallet.balance += rechargeAmount;
//       wallet.last_updated = new Date();
//       await wallet.save();

//       ledger.payment_status = Enums.PAYMENT.STATUS.PAID;
//       ledger.remarks = "Recharge confirmed via PhonePe webhook";
//       ledger.timestamp = new Date();
//       await ledger.save();

//       const finalCredit = (ledger.credit_amount || 0) + bonusAmount;

//       walletNotification.emitWalletUpdate(
//         wallet.user_id.toString(),
//         rechargeAmount,
//         oldBalance,
//         wallet.balance,
//         "success"
//       );

//       logger.info(`[PhonePeWebhook] Payment SUCCESS:
//         walletId=${wallet._id}
//         oldBalance=${oldBalance}
//         newBalance=${wallet.balance}
//         rechargeAmount=${rechargeAmount}
//         bonusAmount=${bonusAmount}
//         finalCredit=${finalCredit}
//         ledgerId=${ledger._id}
//       `);
//     } else {
//       ledger.payment_status = Enums.PAYMENT.STATUS.FAILED;
//       ledger.remarks = `Recharge failed (state=${state}, code=${errorCode}, detailedCode=${detailedErrorCode})`;
//       ledger.timestamp = new Date();
//       await ledger.save();

//       logger.warn(`[PhonePeWebhook] Payment FAILED:
//         ledgerId=${ledger._id}
//         state=${state}
//         code=${errorCode}
//         detailedCode=${detailedErrorCode}
//       `);
//     }

//     logger.info(`[PhonePeWebhook] Ledger updated successfully | ledgerId=${ledger._id}, status=${ledger.payment_status}`);
//     return { success: true };
//   } catch (error) {
//     logger.error("[PhonePeWebhook] Error processing webhook:", error);
//     throw error;
//   }
// };

exports.handlePhonepeWebhook = async (req) => {
  try {
    const rawBody = req.body;
    const headers = req.headers;

    logger.info("[PhonePeWebhook] Received Headers:", headers);
    logger.debug("[PhonePeWebhook] Raw Body:", rawBody.toString("utf8"));

    const authorization = headers["authorization"];
    if (!authorization) throw new Error("Missing Authorization header");

    const provider = Enums.INTEGRATION.PROVIDER.PHONEPAY;
    const redisKey = `phonepe_webhook_credentials_${provider}`;
    let credentials = await redisClient.get(redisKey);

    if (credentials) {
      credentials = JSON.parse(credentials);
      logger.info("[Cache] PhonePe webhook credentials found in Redis");
    } else {
      logger.info("[Cache] Credentials not found in Redis, fetching from DB...");
      const integration = await ThirdPartyIntegration.findOne({
        provider,
        type: Enums.INTEGRATION.TYPE.PAYMENT,
        is_active: true,
      });
      if (!integration || !integration.extra_config?.username || !integration.extra_config?.password) {
        logger.error("[PhonePeWebhook] Integration username/password missing");
        throw new Error("PhonePe webhook credentials missing in DB");
      }
      credentials = {
        username: integration.extra_config.username,
        password: integration.extra_config.password,
      };
      await redisClient.setEx(redisKey, 3600, JSON.stringify(credentials));
      logger.info("[Cache] PhonePe webhook credentials cached in Redis");
    }

    const { username, password } = credentials;

    const client = getPhonePeClient();
    logger.info("[PhonePeWebhook] PhonePe Client Initialized");

    const callbackResponse = client.validateCallback(
      username,
      password,
      authorization,
      rawBody.toString("utf8")
    );

    logger.info("[PhonePeWebhook] Callback Validated Successfully", callbackResponse);

    const { type, payload } = callbackResponse;
    const { orderId, state, errorCode, detailedErrorCode } = payload;

    logger.info(
      `[PhonePeWebhook] Parsed Payload: type=${type}, orderId=${orderId}, state=${state}`
    );

    // 🔹 Lookup ledger using external_transaction_id
    const ledger = await WalletLedger.findOne({
      external_transaction_id: orderId,
      payment_status: Enums.PAYMENT.STATUS.PENDING,
    });

    if (!ledger) {
      logger.warn(`[PhonePeWebhook] Ledger not found for orderId=${orderId}`);
      return { success: false, message: "Ledger not found" };
    }

    const wallet = await Wallet.findById(ledger.wallet_id);
    if (!wallet) throw new Error("Wallet not found");

    const oldBalance = wallet.balance;
    const rechargeAmount = ledger.amount; // Use ledger amount, NOT payload
    const bonusAmount = ledger.bonus_amount || 0;

    if (state === "COMPLETED" || type === "CHECKOUT_ORDER_COMPLETED") {
      wallet.balance += ledger.credit_amount || 0; // ledger.credit_amount includes bonus
      wallet.last_updated = new Date();
      await wallet.save();

      ledger.payment_status = Enums.PAYMENT.STATUS.PAID;
      ledger.remarks = "Recharge confirmed via PhonePe webhook";
      ledger.timestamp = new Date();
      await ledger.save();

      const finalCredit = ledger.credit_amount || 0;

      walletNotification.emitWalletUpdate(
        wallet.user_id.toString(),
        rechargeAmount,
        oldBalance,
        wallet.balance,
        "success"
      );

      logger.info(`[PhonePeWebhook] Payment SUCCESS:
        walletId=${wallet._id}
        oldBalance=${oldBalance}
        newBalance=${wallet.balance}
        rechargeAmount=${rechargeAmount}
        bonusAmount=${bonusAmount}
        finalCredit=${finalCredit}
        ledgerId=${ledger._id}
      `);
    } else {
      ledger.payment_status = Enums.PAYMENT.STATUS.FAILED;
      ledger.remarks = `Recharge failed (state=${state}, code=${errorCode}, detailedCode=${detailedErrorCode})`;
      ledger.timestamp = new Date();
      await ledger.save();

      logger.warn(`[PhonePeWebhook] Payment FAILED:
        ledgerId=${ledger._id}
        state=${state}
        code=${errorCode}
        detailedCode=${detailedErrorCode}
      `);
    }

    logger.info(`[PhonePeWebhook] Ledger updated successfully | ledgerId=${ledger._id}, status=${ledger.payment_status}`);
    return { success: true };
  } catch (error) {
    logger.error("[PhonePeWebhook] Error processing webhook:", error);
    throw error;
  }
};




exports.createRazorpayFundAccount = async (astrologer) => {
  try {
    const integration = await ThirdPartyIntegration.findOne({
      provider: Enums.INTEGRATION.PROVIDER.RAZORPAY,
      type: Enums.INTEGRATION.TYPE.PAYMENT,
      is_active: true,
    });
    if (!integration) throw new Error("No active Razorpay integration");

    const auth = {
      username: integration.api_key,
      password: integration.api_secret,
    };

    // 🔑 Ensure contact exists
    let contactId = astrologer.razorpay_contact_id;
    if (!contactId) {
      const user = await User.findById(astrologer.user_id);

      logger.info(
        `📇 Creating Razorpay contact | name=${astrologer.display_name || user?.name
        }, email=${user?.email}, phone=${user?.phone}`
      );

      const contactRes = await axios.post(
        "https://api.razorpay.com/v1/contacts",
        {
          name: astrologer.display_name || user?.name,
          email: user?.email,
          contact: user?.phone,
          type: "customer",
        },
        { auth }
      );

      contactId = contactRes.data.id;
      astrologer.razorpay_contact_id = contactId;

      logger.info(`✅ Razorpay contact created | contactId=${contactId}`);
    }
   if (
      !astrologer.razorpay_fund_account_id &&
      astrologer.bank_account_number &&
      astrologer.ifsc
    ) {
      logger.info(
        `Creating Razorpay fund account | contactId=${contactId}, ifsc=${astrologer.ifsc}, account=${astrologer.bank_account_number}`
      );

      const fundAccountRes = await axios.post(
        "https://api.razorpay.com/v1/fund_accounts",
        {
          contact_id: contactId,
          account_type: "bank_account",
          bank_account: {
            name: astrologer.display_name,
            ifsc: astrologer.ifsc,
            account_number: astrologer.bank_account_number,
          },
        },
        { auth }
      );

      astrologer.razorpay_fund_account_id = fundAccountRes.data.id;

      logger.info(
        `Razorpay fund account created | fundAccountId=${fundAccountRes.data.id}`
      );
    }

    await astrologer.save();

    logger.info(
      `Astrologer updated with Razorpay details | astrologerId=${astrologer._id}`
    );
  } catch (error) {
    logger.error(
      `Error creating Razorpay fund account | astrologerId=${astrologer?._id}, message=${error.message}, stack=${error.stack}`
    );
    throw error;
  }
};