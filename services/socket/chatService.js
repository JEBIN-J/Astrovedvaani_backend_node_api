const ChatMessage = require("../../models/Chat");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const { getInSession } = require("../../utils/redis/sessionExtend");
const emitSocketError = require("../../utils/socketError");
const sendPushNotification = require("../notification/sendNotification");

function isMessageAllowed(content, mask = false) {
  if (!content || typeof content !== "string") return { allowed: true, content };

  let safe = content;
  let processed = content.toLowerCase();
  let blocked = false;

  const emailLoose = /([a-z0-9._%+-]+\s*[@]\s*[a-z0-9.-]+\s*[\.\]]\s*[a-z]{2,})/gi;
  if (emailLoose.test(processed)) {
    blocked = true;
    if (mask) safe = safe.replace(emailLoose, "XXX");
  }

  const emailWords = /(at|@)\s*(gmail|yahoo|outlook|rediff|hotmail)\s*(dot|\.)\s*[a-z]{2,}/gi;
  if (emailWords.test(processed)) {
    blocked = true;
    if (mask) safe = safe.replace(emailWords, "XXX");
  }

  const socialBase = [
    "facebook",
    "fb",
    "instagram",
    "insta",
    "whatsapp",
    "wa",
    "wa.me",
    "telegram",
    "t.me",
    "snapchat",
    "twitter",
    "x.com",
    "linkedin",
    "linkdin",
  ];

  const collapsed = processed.replace(/[^a-z0-9]/g, "");
  for (const word of socialBase) {
    const pure = word.replace(/[^a-z0-9]/g, "");
    if (collapsed.includes(pure)) {
      blocked = true;
      if (mask) {
        const flexible = word.split("").join("[^a-z0-9]*");
        safe = safe.replace(new RegExp(flexible, "gi"), "XXX");
      }
    }
  }

  const atHandle = /@[\w.]{2,}/gi;
  if (atHandle.test(processed)) {
    blocked = true;
    if (mask) safe = safe.replace(atHandle, "XXX");
  }

  const phoneRegex = /(?:\+?\d[\d\s\-\(\).]{6,}\d)/g;
  const digits = processed.replace(/[^0-9]/g, "");
  if (digits.length >= 7) {
    blocked = true;
    if (mask) safe = safe.replace(phoneRegex, "XXX");
  }

  if (!mask && blocked) return { allowed: false };
  return { allowed: true, content: safe };
}
function handleChatEvents(socketManager, socket) {
  const { io, userSockets } = socketManager;
  if (!socket.user) {
    logger.warn("[SOCKET] chatService connected without user context");
    return;
  }
  const { userId, role } = socket.user;
  socket.on("send_message",async ({ sessionId, receiverId, content, messageType, tempId }, callback) => {
      try {
        const { getSession, getUser } = require("../../utils/redis/sessionCacheService");
        if (!sessionId || !receiverId || !content) {
          return emitSocketError(socket, "MESSAGE_VALIDATION_FAILED", "Missing required fields");
        }
        const session = await getSession(sessionId);
        if (!session || session.status !== Enums.SERVICE.STATUS.ONGOING) {
          return emitSocketError(socket, "SESSION_INACTIVE", "Cannot send messages. Session is not active.");
        }
        // const allowedCheck = isMessageAllowed(content, true);
        // content = allowedCheck.content;
        let sender = await getUser(userId);
        if (!sender) sender = { id: userId, name: "Unknown", role };
        const messagePayload = {
          _id: tempId || `temp_${Date.now()}`,
          sessionId,
          sender: {
            id: sender._id || sender.id || userId,
            name: sender.name || sender.display_name || "Unknown",
            role: sender.role || role,
            profilePicture: sender.profilePicture || null,
            display_name: sender.display_name || sender.name || null
          },
          receiverId,
          content,
          message_type: Number.isInteger(messageType)
            ? messageType
            : Enums.COMMUNICATION.MESSAGE_TYPE.TEXT,
          isRead: false,
          createdAt: new Date(),
          channelId: Enums.COMMUNICATION.CHANNEL.MESSAGE
        };

        const receiverSockets = userSockets.get(receiverId);
        const delivered = receiverSockets && receiverSockets.size > 0;
        if (delivered) {
          for (const sockId of receiverSockets) {
            io.to(sockId).emit("new_message", messagePayload);
          }
        } else {
          sendPushNotification(receiverId, "New Message", content, messagePayload)
            .catch(err => logger.error("[SOCKET] Push failed:", err));
        }
        callback?.({ success: true, message: messagePayload });
        ChatMessage.create({
          session_id: sessionId,
          sender_id: userId,
          receiver_id: receiverId,
          content,
          message_type: messagePayload.message_type,
          is_read: delivered,
          read_at: delivered ? new Date() : null
        }).catch(err => logger.error("[SOCKET] DB save failed:", err));
      } catch (err) {
        logger.error("[SOCKET] send_message error:", err);
        emitSocketError(socket, "MESSAGE_SEND_ERROR", "Failed to send message");
        callback?.({ success: false });
      }
    }
  );
  socket.on("typing", async ({ receiverId, sessionId, isTyping }) => {
    try {
      const { getSession } = require("../../utils/redis/sessionCacheService");
      const session = await getSession(sessionId);
      if (!session || session.status !== Enums.SERVICE.STATUS.ONGOING) return;

      const receiverSockets = userSockets.get(receiverId);
      if (!receiverSockets) return;

      for (const sockId of receiverSockets) {
        io.to(sockId).emit("typing", { senderId: userId, sessionId, isTyping });
      }
    } catch (err) {
      logger.error("[SOCKET] typing error:", err);
    }
  });
  socket.on("mark_read", async ({ messageIds = [] }) => {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return;

    await ChatMessage.updateMany(
      { _id: { $in: messageIds }, receiver_id: userId },
      { $set: { is_read: true, read_at: new Date() } }
    );
  });
}

module.exports = handleChatEvents;
