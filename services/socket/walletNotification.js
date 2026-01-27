const Notification = require('../../models/Notification');
const Enums = require('../../utils/constants');
const logger = require('../../utils/logger');
const { formatNotification } = require('../../utils/notificationFormatter');

let io = null;
function registerWalletSocketManager(socketManager) {
  if (!socketManager?.io) {
    logger.warn('[WalletSocket] socketManager.io not found');
    return;
  }
  io = socketManager.io;
  logger.info('[WalletSocket] Wallet Socket Manager registered');
}
async function emitWalletUpdate(
  userId,
  amount,
  oldBalance,
  newBalance,
  status = 'success',
  context = 'recharge',
  role = 100
) {
  if (!io) {
    logger.warn('[WalletSocket] SocketManager not initialized, cannot send wallet notification');
    return;
  }

  let message, type;

  if (status === 'success') {
    switch (context) {
      case 'recharge':
        message = `Your wallet has been credited with ₹${amount}. Old balance: ₹${oldBalance}, New balance: ₹${newBalance}`;
        type = Enums.NOTIFICATION.NOTIFICATION_TYPE.PAYMENT_SUCCESS;
        break;

      case 'booking':
        if (role === 100) {
          message = `Your booking was successful. ₹${amount} has been deducted. Old balance: ₹${oldBalance}, New balance: ₹${newBalance}`;
          type = Enums.NOTIFICATION.NOTIFICATION_TYPE.POOJA_BOOKING;
        } else {
          message = `You have received ₹${amount} for booking. Old balance: ₹${oldBalance}, New balance: ₹${newBalance}`;
          type = Enums.NOTIFICATION.NOTIFICATION_TYPE.POOJA_CREDIT;
        }
        break;

      case 'service':
        if (role === 100) {
          message = `Service availed successfully. ₹${amount} has been deducted. Old balance: ₹${oldBalance}, New balance: ₹${newBalance}`;
          type = Enums.NOTIFICATION.NOTIFICATION_TYPE.CONSULTATION;
        } else {
          message = `You have earned ₹${amount} from consultation. Old balance: ₹${oldBalance}, New balance: ₹${newBalance}`;
          type = Enums.NOTIFICATION.NOTIFICATION_TYPE.CONSULTATION_CREDIT;
        }
        break;

      case 'product':
        message = `Your product has been booked successfully. ₹${amount} has been deducted. Old balance: ₹${oldBalance}, New balance: ₹${newBalance}`;
        type = Enums.NOTIFICATION.NOTIFICATION_TYPE.PRODUCT_BOOKING;
        break;

      default:
        message = `Wallet updated successfully. ₹${amount} processed. Old balance: ₹${oldBalance}, New balance: ₹${newBalance}`;
        type = Enums.NOTIFICATION.NOTIFICATION_TYPE.WALLET_UPDATE;
    }
  } else if (status === 'failed') {
    switch (context) {
      case 'recharge':
        message = `Your recharge of ₹${amount} has failed. Balance remains ₹${oldBalance}`;
        type = Enums.NOTIFICATION.NOTIFICATION_TYPE.PAYMENT_FAILED;
        break;

      case 'booking':
        message = `Your booking of ₹${amount} failed. Balance remains ₹${oldBalance}`;
        type = Enums.NOTIFICATION.NOTIFICATION_TYPE.BOOKING_FAILED;
        break;

      case 'product':
        message = `Your product booking of ₹${amount} has failed. Balance remains ₹${oldBalance}`;
        type = Enums.NOTIFICATION.NOTIFICATION_TYPE.PRODUCT_FAILED;
        break;

      default:
        message = `Transaction of ₹${amount} failed. Balance remains ₹${oldBalance}`;
        type = Enums.NOTIFICATION.NOTIFICATION_TYPE.TRANSACTION_FAILED;
    }
  }

  try {
    const notification = await Notification.create({
      recipient_id: userId,
      sender_id: null,
      type,
      title: 'Wallet Update',
      message,
      related_entity: {
        entity_type: 'Wallet',
        entity_id: userId,
      },
      meta: { amount, oldBalance, newBalance, status, context, role },
    });

    const formatted = formatNotification(notification);

    io.to(`user_${userId}`).emit('wallet_updated', {
      ...formatted,
      amount,
      oldBalance,
      newBalance,
      status,
      context,
      role,
    });

    logger.info(`[WalletSocket] Wallet update emitted → user ${userId}, context=${context}, role=${role}`);
  } catch (err) {
    logger.error(`[WalletSocket] Failed to create/emit wallet notification for user ${userId}:`, err);
  }
}

module.exports = {
  registerWalletSocketManager,
  emitWalletUpdate
};
