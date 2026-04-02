const Enums = require("../../utils/constants");
const { notifyUserHybrid } = require("../socket/realtimeOrPushNotifier");

async function notifyRateRequestUpdate({
  astrologerUserId,
  status,
  rate,
  serviceType
}) {
  const isApproved = status === Enums.USER.VERIFICATION_STATUS.APPROVED;
  const message = isApproved
    ? `Your rate request of ₹${rate} has been approved`
    : `Your rate request of ₹${rate} has been rejected`;

  return notifyUserHybrid({
    userId: astrologerUserId,
    event: "rate_request_updated",
    title: "Rate Request Update",
    message,
    payload: {
      type: "RATE_REQUEST_UPDATE",
      status,
      rate,
      serviceType
    },
    channelId:Enums.USER.CHANNEL.RATE_UPDATES
  });
}

module.exports = {
  notifyRateRequestUpdate
};