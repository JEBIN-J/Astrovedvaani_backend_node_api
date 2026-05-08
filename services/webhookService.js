const crypto = require("crypto");
const Wallet = require("../models/Wallet");
const WalletLedger = require("../models/Ledger");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");
const Razorpay = require("razorpay");
const ThirdPartyIntegration = require("../models/ThirdPartyIntegration");
const User = require("../models/User");
const axios = require("axios");
const redisClient = require("../utils/redis/redisClient");
const walletNotification = require("../services/socket/walletNotification");
// const { getPhonePeClient } = require("../config/phonepeClient");

exports.handleRazorpayWebhook = async (req) => {
  const provider = Enums.INTEGRATION.PROVIDER.RAZORPAY;
  try {
    const integration = await ThirdPartyIntegration.findOne({
      provider,
      type: Enums.INTEGRATION.TYPE.PAYMENT,
      is_active: true,
    });
    const secret = integration.extra_config.webhook_secret;
    if (!secret) {
      logger.error("Webhook secret missing");
      return;
    }
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body.toString("utf8");
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    if (signature !== expectedSignature) {
      logger.warn("Invalid Razorpay signature");
      return;
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (err) {
      logger.error("Invalid webhook JSON");
      return;
    }
    const payment = payload?.payload?.payment?.entity;
    const event = payload?.event;
    if (!payment) {
      logger.warn("Payment entity missing in webhook");
      return;
    }
    const { order_id, id: payment_id, status } = payment;
    if (!["captured", "failed"].includes(status)) {
      logger.info(`Ignoring status=${status}`);
      return;
    }
    const update =
      status === "captured"
        ? {
            payment_status: Enums.PAYMENT.STATUS.PAID,
            external_transaction_id: payment_id,
            remarks: "Recharge confirmed via webhook",
            timestamp: new Date(),
          }
        : {
            payment_status: Enums.PAYMENT.STATUS.FAILED,
            external_transaction_id: payment_id,
            remarks: "Recharge failed via webhook",
            timestamp: new Date(),
          };
    const ledger = await WalletLedger.findOneAndUpdate(
      {
        related_entity_id: order_id,
        payment_status: Enums.PAYMENT.STATUS.PENDING,
      },
      { $set: update },
      { new: true },
    );
    if (!ledger) {
      logger.info("Ledger not found or already processed");
      return;
    }
    if (status === "captured") {
      const wallet = await Wallet.findById(ledger.wallet_id);
      if (!wallet) {
        logger.error("Wallet not found");
        return;
      }
      const oldBalance = wallet.balance;
      wallet.balance += ledger.credit_amount;
      wallet.last_updated = new Date();
      await wallet.save();
      walletNotification.emitWalletUpdate(
        wallet.user_id.toString(),
        ledger.credit_amount,
        oldBalance,
        wallet.balance,
        "success",
      );
    }
    if (status === "failed") {
      const wallet = await Wallet.findById(ledger.wallet_id);
      if (wallet) {
        walletNotification.emitWalletUpdate(
          wallet.user_id.toString(),
          ledger.amount,
          wallet.balance,
          wallet.balance,
          "failed",
        );
      }
    }
    logger.info(
      `Webhook processed successfully | order=${order_id} status=${status}`,
    );
  } catch (err) {
    logger.error("Unhandled Razorpay webhook error", err);
    return;
  }
};
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
//     const { orderId, state, errorCode, detailedErrorCode } = payload;

//     logger.info(
//       `[PhonePeWebhook] Parsed Payload: type=${type}, orderId=${orderId}, state=${state}`
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
//     const rechargeAmount = ledger.amount; // Use ledger amount, NOT payload
//     const bonusAmount = ledger.bonus_amount || 0;

//     if (state === "COMPLETED" || type === "CHECKOUT_ORDER_COMPLETED") {
//       wallet.balance += ledger.credit_amount || 0; // ledger.credit_amount includes bonus
//       wallet.last_updated = new Date();
//       await wallet.save();

//       ledger.payment_status = Enums.PAYMENT.STATUS.PAID;
//       ledger.remarks = "Recharge confirmed via PhonePe webhook";
//       ledger.timestamp = new Date();
//       await ledger.save();

//       const finalCredit = ledger.credit_amount || 0;

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
        `📇 Creating Razorpay contact | name=${
          astrologer.display_name || user?.name
        }, email=${user?.email}, phone=${user?.phone}`,
      );

      const contactRes = await axios.post(
        "https://api.razorpay.com/v1/contacts",
        {
          name: astrologer.display_name || user?.name,
          email: user?.email,
          contact: user?.phone,
          type: "customer",
        },
        { auth },
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
        `Creating Razorpay fund account | contactId=${contactId}, ifsc=${astrologer.ifsc}, account=${astrologer.bank_account_number}`,
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
        { auth },
      );

      astrologer.razorpay_fund_account_id = fundAccountRes.data.id;

      logger.info(
        `Razorpay fund account created | fundAccountId=${fundAccountRes.data.id}`,
      );
    }

    await astrologer.save();

    logger.info(
      `Astrologer updated with Razorpay details | astrologerId=${astrologer._id}`,
    );
  } catch (error) {
    logger.error(
      `Error creating Razorpay fund account | astrologerId=${astrologer?._id}, message=${error.message}, stack=${error.stack}`,
    );
    throw error;
  }
};
