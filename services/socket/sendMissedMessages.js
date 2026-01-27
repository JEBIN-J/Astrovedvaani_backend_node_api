const ChatMessage = require("../../models/Chat");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");

module.exports = async function sendMissedMessages(socket, userId, sessionId) {
  try {
    const missedMessages = await ChatMessage.find({
      session_id: sessionId,
      receiver_id: userId,
      is_read: false,
    })
      .sort({ createdAt: 1 })
      .lean();
    if (!missedMessages.length) return;
    logger.info(
      `[REJOIN] Sending ${missedMessages.length} missed messages to ${userId}`
    );
    for (const msg of missedMessages) {
      socket.emit("new_message", {
        _id: msg._id,
        sessionId: msg.session_id,
        sender: {
          id: msg.sender_id,
          name: msg.sender_name || "Unknown",
          role: msg.sender_role || null,
          profilePicture: msg.sender_profile_picture || null,
          display_name: msg.sender_display_name || null,
        },
        receiverId: msg.receiver_id,
        content: msg.content,
        message_type: msg.message_type,
        isRead: false,
        createdAt: msg.createdAt,
        channelId: Enums.COMMUNICATION.CHANNEL.MESSAGE,
      });
    }
  } catch (err) {
    logger.error("[REJOIN] sendMissedMessages failed:", err);
  }
};