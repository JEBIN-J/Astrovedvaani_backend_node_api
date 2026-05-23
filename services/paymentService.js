const Razorpay = require("razorpay");
const Order = require("../models/Order");
const Wallet = require("../models/Wallet");
const WalletLedger = require("../models/Ledger");
const Integration = require("../models/ThirdPartyIntegration");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");
const { updatePoojaBookingAfterPayment } = require("./user/poojaService");
const { getAdminUserId } = require("./session/userService");
const PoojaBooking = require("../models/PoojaBooking");
const User = require("../models/User");
const Astrologer = require("../models/Astrologer");
const { updateWalletAndLedger } = require("./walletService");
const InvoiceService = require("../services/user/astromall/InvoiceService");

exports.confirmOrderPayment = async (userId, paymentInfo) => {
  logger.info("Confirming payment", { userId, paymentInfo });

  const {
    razorpay_order_id,
    razorpay_payment_id,
    amount,
    provider,
    method,
    order_id,
  } = paymentInfo;

  const existing = await WalletLedger.findOne({
    external_transaction_id: razorpay_payment_id,
  });

  if (existing) {
    logger.warn("Duplicate payment detected", {
      payment_id: razorpay_payment_id,
    });
    throw new Error("Duplicate payment");
  }

  const order = await Order.findOne({
    _id: order_id,
    user_id: userId,
    payment_status: Enums.PAYMENT.STATUS.PENDING,
  });

  if (!order) {
    logger.error("Order not found or already paid", { userId, order_id });
    throw new Error("Order not found or already paid");
  }

  const wallet = await Wallet.findOne({ user_id: userId });

  const ledger = await WalletLedger.create({
    wallet_id: wallet?._id,
    transaction_type: Enums.TRANSACTION.TYPE.ORDER,
    direction: Enums.TRANSACTION.DIRECTION.DEBIT,
    amount,
    gst_included: true,
    gst_percent: order.price_snapshot.gst_percent,
    final_amount: amount,
    payment_method: method,
    payment_provider: provider,
    payment_status: Enums.PAYMENT.STATUS.PAID,
    related_entity_id: order._id,
    related_entity_type: "ORDER",
    external_transaction_id: razorpay_payment_id,
    remarks: "Order payment via Razorpay",
    timestamp: new Date(),
  });

  order.payment_status = Enums.PAYMENT.STATUS.PAID;
  order.transaction_id = ledger._id;
  await order.save();
  if (order.order_type === Enums.ORDER.TYPE.POOJA) {
    logger.info("update pooja order ");
    await updatePoojaBookingAfterPayment(order);
  }

  logger.info("Payment confirmed successfully", {
    userId,
    ledger_id: ledger._id,
    order_id: order._id,
  });

  return { success: true, ledger_id: ledger._id, order_id: order._id };
};
exports.initiateOrderPayment = async (userId, orderId, method, provider) => {
  try {
    logger.info("Initiating order payment", {
      userId,
      orderId,
      method,
      provider,
    });

    let order;
    try {
      order = await Order.findOne({ _id: orderId, user_id: userId });
      if (!order) throw new Error("Order not found");
    } catch (err) {
      logger.error("Error in fetching order", err);
      throw err;
    }

    if (order.payment_status !== Enums.PAYMENT.STATUS.PENDING) {
      throw new Error("Payment already processed");
    }

    const isWallet = Number(method) === Enums.PAYMENT.METHOD.WALLET;
    const isastrovedvanni =
      Number(provider) === Enums.PAYMENT.PROVIDER.ASTROVEDVANNI;

    if (isWallet && isastrovedvanni) {
      let userWallet;
      try {
        userWallet = await Wallet.findOne({ user_id: userId });
        if (!userWallet || userWallet.balance < order.total_payable) {
          throw new Error("Insufficient wallet balance");
        }
      } catch (err) {
        logger.error("Error in user wallet check", err);
        throw err;
      }

      let adminUserId, adminWallet;
      try {
        adminUserId = await getAdminUserId();
        adminWallet = await Wallet.findOne({ user_id: adminUserId });
      } catch (err) {
        logger.error("Error in admin wallet fetch", err);
        throw err;
      }

      let astrologer = null;
      let astroWallet = null;
      let astrologerAmount = 0;
      let adminAmount = order.total_payable;

      if (order.order_type === Enums.ORDER.TYPE.POOJA) {
        try {
          const booking = await PoojaBooking.findById(order.reference_id);
          if (!booking) throw new Error("Pooja booking not found");

          const astrologerDoc = await Astrologer.findById(
            booking.astrologer_id,
          );
          if (astrologerDoc) {
            astrologer = await User.findById(astrologerDoc.user_id);
            if (astrologer) {
              astroWallet = await Wallet.findOne({
                user_id: astrologer._id,
              });
            }
          }

          astrologerAmount = booking.astrologer_share_amount || 0;
          adminAmount = order.total_payable - astrologerAmount;
        } catch (err) {
          logger.error("Error in pooja handling", err);
          throw err;
        }
      }

      const remarks = `Order ID: ${order._id}`;
      const entityType =
        order.order_type === Enums.ORDER.TYPE.POOJA
          ? Enums.ENTITY.TYPE.POOJA
          : Enums.ENTITY.TYPE.PRODUCT;

      let userLedger;
      try {
        const res = await updateWalletAndLedger({
          userId,
          amount: -order.total_payable,
          remarks,
          transactionType: Enums.TRANSACTION.TYPE.PURCHASE,
          relatedEntityId: order._id,
          relatedEntityType: entityType,
        });
        userLedger = res.ledger;
      } catch (err) {
        logger.error("Error in user wallet debit", err);
        throw err;
      }

      try {
        await updateWalletAndLedger({
          userId: adminUserId,
          amount: adminAmount,
          remarks: `${remarks} (Admin share)`,
          transactionType: Enums.TRANSACTION.TYPE.PURCHASE,
          relatedEntityId: order._id,
          relatedEntityType: entityType,
        });
      } catch (err) {
        logger.error("Error in admin credit", err);
        throw err;
      }

      if (
        order.order_type === Enums.ORDER.TYPE.POOJA &&
        astrologer &&
        astroWallet &&
        astrologerAmount > 0
      ) {
        try {
          await updateWalletAndLedger({
            userId: astrologer._id,
            amount: astrologerAmount,
            remarks: `${remarks} (Astrologer share)`,
            transactionType: Enums.TRANSACTION.TYPE.PURCHASE,
            relatedEntityId: order._id,
            relatedEntityType: entityType,
          });
        } catch (err) {
          logger.error("Error in astrologer credit", err);
          throw err;
        }
      }

      try {
        order.payment_status = Enums.PAYMENT.STATUS.PAID;
        order.transaction_id = userLedger?._id || null;
        await order.save();
      } catch (err) {
        logger.error("Error in order update", err);
        throw err;
      }

      // try {
      //   await InvoiceService.generateInvoice(order, userLedger?._id);
      // } catch (err) {
      //   logger.error("Error in invoice generation", err);
      //   throw err;
      // }

      if (order.order_type === Enums.ORDER.TYPE.POOJA) {
        try {
          await updatePoojaBookingAfterPayment(order);
        } catch (err) {
          logger.error("Error in pooja update", err);
          throw err;
        }
      }

      logger.info("Wallet payment and ledger creation completed", {
        userId,
        orderId,
      });

      return { payment_mode: "wallet", paid: true };
    }

    const isUPI = Number(method) === Enums.PAYMENT.METHOD.UPI;
    const isRazorpay = Number(provider) === Enums.PAYMENT.PROVIDER.RAZORPAY;

    if (isUPI && isRazorpay) {
      try {
        const integration = await Integration.findOne({
          provider,
          type: Enums.INTEGRATION.TYPE.PAYMENT,
          is_active: true,
        });

        if (!integration) throw new Error("Payment gateway not configured");

        const razorpay = new Razorpay({
          key_id: integration.api_key,
          key_secret: integration.api_secret,
        });

        const razorOrder = await razorpay.orders.create({
          amount: Math.round(order.total_payable * 100),
          currency: "INR",
          receipt: `order_${order._id}`,
          notes: {
            order_id: order._id.toString(),
            user_id: userId.toString(),
          },
        });

        return {
          provider: "RAZORPAY",
          order_id: razorOrder.id,
          gateway_key: integration.api_key,
          amount: razorOrder.amount / 100,
          currency: razorOrder.currency,
        };
      } catch (err) {
        logger.error("Error in Razorpay flow", err);
        throw err;
      }
    }

    throw new Error("Unsupported payment method");
  } catch (error) {
    logger.error("FINAL ERROR", {
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

// exports.initiateOrderPayment = async (userId, orderId, method, provider) => {
//   logger.info("Initiating order payment", {
//     userId,
//     orderId,
//     method,
//     provider,
//   });

//   const order = await Order.findOne({ _id: orderId, user_id: userId });
//   if (!order) throw new Error("Order not found");

//   if (order.payment_status !== Enums.PAYMENT.STATUS.PENDING) {
//     throw new Error("Payment already processed");
//   }

//   const isWallet = Number(method) === Enums.PAYMENT.METHOD.WALLET;
//   const isastrovedvanni =
//     Number(provider) === Enums.PAYMENT.PROVIDER.astrovedvanni;

//   if (isWallet && isastrovedvanni) {
//     const userWallet = await Wallet.findOne({ user_id: userId });
//     if (!userWallet || userWallet.balance < order.total_payable) {
//       throw new Error("Insufficient wallet balance");
//     }

//     const adminUserId = await getAdminUserId();
//     const adminWallet = await Wallet.findOne({ user_id: adminUserId });

//     let astrologer = null;
//     let astroWallet = null;
//     let astrologerAmount = 0;
//     let adminAmount = order.total_payable;

//     // Handle Pooja type orders
//     if (order.order_type === Enums.ORDER.TYPE.POOJA) {
//       const booking = await PoojaBooking.findById(order.reference_id);
//       if (!booking) throw new Error("Pooja booking not found");

//       const astrologerDoc = await Astrologer.findById(booking.astrologer_id);
//       if (astrologerDoc) {
//         astrologer = await User.findById(astrologerDoc.user_id);
//         if (astrologer)
//           astroWallet = await Wallet.findOne({ user_id: astrologer._id });
//       }

//       astrologerAmount = booking.astrologer_share_amount || 0;
//       adminAmount = order.total_payable - astrologerAmount;
//     }

//     const timestamp = new Date();
//     const remarks = `Order ID: ${order._id}`;
//     const entityType =
//       order.order_type === Enums.ORDER.TYPE.POOJA
//         ? Enums.ENTITY.TYPE.POOJA
//         : Enums.ENTITY.TYPE.PRODUCT;

//     // 1️⃣ User debit
//     // await updateWalletAndLedger({
//     const { ledger: userLedger } = await updateWalletAndLedger({
//       userId,
//       amount: -order.total_payable,
//       remarks,
//       transactionType: Enums.TRANSACTION.TYPE.PURCHASE,
//       relatedEntityId: order._id,
//       relatedEntityType: entityType,
//     });

//     // 2️⃣ Admin credit
//     await updateWalletAndLedger({
//       userId: adminUserId,
//       amount: adminAmount,
//       remarks: `${remarks} (Admin share)`,
//       transactionType: Enums.TRANSACTION.TYPE.PURCHASE,
//       relatedEntityId: order._id,
//       relatedEntityType: entityType,
//     });

//     // 3️⃣ Astrologer credit (if applicable)
//     if (
//       order.order_type === Enums.ORDER.TYPE.POOJA &&
//       astrologer &&
//       astroWallet &&
//       astrologerAmount > 0
//     ) {
//       await updateWalletAndLedger({
//         userId: astrologer._id,
//         amount: astrologerAmount,
//         remarks: `${remarks} (Astrologer share)`,
//         transactionType: Enums.TRANSACTION.TYPE.PURCHASE,
//         relatedEntityId: order._id,
//         relatedEntityType: entityType,
//       });
//     }

//     // Update Order status
//     order.payment_status = Enums.PAYMENT.STATUS.PAID;
//     order.transaction_id = userLedger?._id || null;
//     await order.save();

//     // if(order.order_type === Enums.ORDER.TYPE.PRODUCT)
//     // {
//     // const invoice = await InvoiceService.generateInvoice(order, userLedger?._id);
//     // }
//     if (order.order_type === Enums.ORDER.TYPE.PRODUCT) {
//       // Fire-and-forget background call
//       (async () => {
//         try {
//           const invoice = await InvoiceService.generateInvoice(
//             order,
//             userLedger?._id,
//           );
//           console.log(`Invoice generated: ${invoice._id}`);
//         } catch (err) {
//           console.error("Error generating invoice in background:", err);
//         }
//       })();
//     }

//     // Update related entity
//     if (order.order_type === Enums.ORDER.TYPE.POOJA) {
//       await updatePoojaBookingAfterPayment(order);
//     }

//     logger.info("Wallet payment and ledger creation completed", {
//       userId,
//       orderId,
//     });
//     return { payment_mode: "wallet", paid: true };
//   }

//   // Handle Razorpay/UPI payment
//   const isUPI = Number(method) === Enums.PAYMENT.METHOD.UPI;
//   const isRazorpay = Number(provider) === Enums.PAYMENT.PROVIDER.RAZORPAY;

//   if (isUPI && isRazorpay) {
//     const integration = await Integration.findOne({
//       provider,
//       type: Enums.INTEGRATION.TYPE.PAYMENT,
//       is_active: true,
//     });

//     if (!integration) throw new Error("Payment gateway not configured");

//     const razorpay = new Razorpay({
//       key_id: integration.api_key,
//       key_secret: integration.api_secret,
//     });

//     const razorOrder = await razorpay.orders.create({
//       amount: Math.round(order.total_payable * 100),
//       currency: "INR",
//       receipt: `order_${order._id}`,
//       notes: { order_id: order._id.toString(), user_id: userId.toString() },
//     });

//     return {
//       provider: "RAZORPAY",
//       order_id: razorOrder.id,
//       gateway_key: integration.api_key,
//       amount: razorOrder.amount / 100,
//       currency: razorOrder.currency,
//     };
//   }

//   throw new Error("Unsupported payment method");
// };
