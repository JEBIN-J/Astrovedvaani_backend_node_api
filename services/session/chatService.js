const { getAstrologerDetails } = require('./astrologerService');
const Enums = require('../utils/constants');

async function canSendChatRequest(userId, astrologerUserId) {
  try {
    const details = await getAstrologerDetails(astrologerUserId, {
      service_type: Enums.SERVICE.TYPE.CHAT,
      is_online: true
    });
    if (!details || !details.serviceRate) return false;
    return true;
  } catch (err) {
    console.error('Chat validation failed:', err.message);
    return false;
  }
}

module.exports = {
  canSendChatRequest
};
