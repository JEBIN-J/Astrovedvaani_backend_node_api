const ChatMessage = require("../../models/Chat");
const User = require("../../models/User");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const { getInSession } = require("../../utils/redis/sessionExtend");
const emitSocketError = require("../../utils/socketError");
const sendPushNotification = require("../notification/sendNotification");

function isMessageAllowed(content = "") {
  let alert = false;
  let modified = content;

  if (!content || typeof content !== "string") {
    return { content, alert: false };
  }

  // ================= EMAIL DETECTION =================
  // Covers most valid emails

  const emailRegex =
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

  if (emailRegex.test(modified)) {
    alert = true;
    modified = modified.replace(emailRegex, "XXXX");
  }

  // ================= MOBILE NUMBER DETECTION =================
  // Covers:
  // 9876543210
  // +919876543210
  // 98765 43210
  // 98765-43210
  // (987)6543210
  // etc

  const phoneRegex =
    /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{3,5}/g;

  const matches = modified.match(phoneRegex);

  if (matches) {
    matches.forEach((match) => {
      // Only treat as phone if 10+ digits exist
      const digits = match.replace(/\D/g, "");

      if (digits.length >= 10) {
        alert = true;
        modified = modified.replace(match, "XXXX");
      }
    });
  }

  return {
    content: modified,
    alert,
  };
}
function handleChatEvents(socketManager, socket) {
  const { io, userSockets } = socketManager;
  if (!socket.user) {
    logger.warn("[SOCKET] chatService connected without user context");
    return;
  }
  const { userId, role } = socket.user;
  socket.on(
    "send_message",
    async (
      { sessionId, receiverId, content, messageType, tempId },
      callback,
    ) => {
      try {
        const {
          getSession,
          getUser,
        } = require("../../utils/redis/sessionCacheService");
        if (!sessionId || !receiverId || !content) {
          return emitSocketError(
            socket,
            "MESSAGE_VALIDATION_FAILED",
            "Missing required fields",
          );
        }
        const session = await getSession(sessionId);
        if (!session || session.status !== Enums.SERVICE.STATUS.ONGOING) {
          return emitSocketError(
            socket,
            "SESSION_INACTIVE",
            "Cannot send messages. Session is not active.",
          );
        }
        let sender = await getUser(userId);
        if (!sender) sender = { id: userId, name: "Unknown", role };
        let {alert,content:modifiedContent} = isMessageAllowed(content);
        console.log("Message content after validation:", modifiedContent, "Alert:", alert);
        const messagePayload = {
          _id: tempId || `temp_${Date.now()}`,
          sessionId,
          sender: {
            id: sender._id || sender.id || userId,
            name: sender.name || sender.display_name || "Unknown",
            role: sender.role || role,
            profilePicture: sender.profilePicture || null,
            display_name: sender.display_name || sender.name || null,
          },
          receiverId,
          content:modifiedContent,
          message_type: Number.isInteger(messageType)
            ? messageType
            : Enums.COMMUNICATION.MESSAGE_TYPE.TEXT,
          isRead: false,
          createdAt: new Date(),
          channelId: Enums.COMMUNICATION.CHANNEL.MESSAGE,
        };

        const receiverSockets = userSockets.get(receiverId);
        const delivered = receiverSockets && receiverSockets.size > 0;
        if (delivered) {
          for (const sockId of receiverSockets) {
            io.to(sockId).emit("new_message", messagePayload);
          }
        } else {
          sendPushNotification(
            receiverId,
            "New Message",
            content,
            messagePayload,
          ).catch((err) => logger.error("[SOCKET] Push failed:", err));
        }
        callback?.({ success: true, message: messagePayload });
        ChatMessage.create({
          session_id: sessionId,
          sender_id: userId,
          receiver_id: receiverId,
          content: modifiedContent,
          message_type: messagePayload.message_type,
          is_read: delivered,
          read_at: delivered ? new Date() : null,
        }).catch((err) => logger.error("[SOCKET] DB save failed:", err));
        if(alert) {
          logger.warn(`[SOCKET] Message from user ${userId} contained sensitive info. Original: "${content}", Modified: "${modifiedContent}"`);
          let user = await User.findById(userId).select("alert");
          user.alert = user?.alert + 1 || 1;
          console.log(`Updated alert count for user ${userId}:`, user.alert);
          await user.save().catch((err) => logger.error("[SOCKET] Alert count update failed:", err));
        }
      } catch (err) {
        logger.error("[SOCKET] send_message error:", err);
        emitSocketError(socket, "MESSAGE_SEND_ERROR", "Failed to send message");
        callback?.({ success: false });
      }
    },
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
      { $set: { is_read: true, read_at: new Date() } },
    );
  });
  socket.on(
    "send_remedy_suggestion",
    async ({ sessionId, receiverId, products = [], poojas = [] }, callback) => {
      try {
        if(role !== Enums.USER.ROLE.ASTROLOGER) {
          return emitSocketError(
            socket,
            "UNAUTHORIZED",
            "Only astrologers can send remedy suggestions.",
          );
        }
        const { getSession } = require("../../utils/redis/sessionCacheService");
        const session = await getSession(sessionId);
        if (!session || session.status !== Enums.SERVICE.STATUS.ONGOING) {
          return emitSocketError(
            socket,
            "SESSION_INACTIVE",
            "Cannot send suggestions. Session is not active.",
          );
        }

        let validProducts = [];
        let validPoojas = [];

        if (products.length > 0) {
          const Product = require("../../models/Product");
          validProducts = await Product.find({ _id: { $in: products } })
            .select("_id name selling_price thumbnailImage summary")
            .lean();
        }

        if (poojas.length > 0) {
          const Pooja = require("../../models/Pooja");
          validPoojas = await Pooja.find({ _id: { $in: poojas } })
            .select("_id name selling_price image_url")
            .lean();
        }
        const suggestionPayload = {
          sessionId,
          senderId: userId,
          receiverId,
          products: validProducts,
          poojas: validPoojas,
          createdAt: new Date(),
        };
        const receiverSockets = userSockets.get(receiverId);
        const delivered = receiverSockets && receiverSockets.size > 0;
        if (delivered) {
          for (const sockId of receiverSockets) {
            io.to(sockId).emit("remedy_suggestion_sent", suggestionPayload);
          }
        } else {
          sendPushNotification(
            receiverId,
            "New Remedy Suggestion",
            "You have received a new remedy suggestion.",
            suggestionPayload,
          ).catch((err) => logger.error("[SOCKET] Push failed:", err));
        }
        callback?.({ success: true, suggestion: suggestionPayload });
        const RemedySuggestion = require("../../models/RemedySuggestion");
        RemedySuggestion.create({
          userId: receiverId,
          astrologerUserId: userId,
          sessionId,
          products,
          poojas,
        }).catch((err) =>
          logger.error("[SOCKET] RemedySuggestion save failed:", err),
        );
      } catch (err) {
        logger.error("[SOCKET] send_remedy_suggestion error:", err);
        emitSocketError(
          socket,
          "SUGGESTION_SEND_ERROR",
          "Failed to send remedy suggestion",
        );
        callback?.({ success: false });
      }
    },
  );
}
module.exports = handleChatEvents;