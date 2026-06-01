const mongoose = require("mongoose");
const ChatMessage = require("../../models/Chat");
const User = require("../../models/User");
const Astrologer = require("../../models/Astrologer");
const { buildPaginationResponse } = require("../../utils/pagination");
const logger = require("../../utils/logger");

exports.getChatList = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const userObjectId = new mongoose.Types.ObjectId(userId);
  logger.info(
    `[CHAT LIST] Fetching chat list for userId: ${userId}, page: ${page}, limit: ${limit}`,
  );
  const chats = await ChatMessage.aggregate([
    {
      $match: {
        $or: [{ sender_id: userObjectId }, { receiver_id: userObjectId }],
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ["$sender_id", userObjectId] },
            "$receiver_id",
            "$sender_id",
          ],
        },
        lastMessageAt: { $first: "$createdAt" },
      },
    },
    { $skip: skip },
    { $limit: limit },
  ]);

  logger.info(`[CHAT LIST] Found ${chats.length} distinct chat partners`);
  const totalDocs = await ChatMessage.aggregate([
    {
      $match: {
        $or: [{ sender_id: userObjectId }, { receiver_id: userObjectId }],
      },
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ["$sender_id", userObjectId] },
            "$receiver_id",
            "$sender_id",
          ],
        },
      },
    },
    { $count: "count" },
  ]);

  const partnerIds = chats.map((c) => c._id);
  logger.info(`[CHAT LIST] Partner IDs: ${partnerIds.join(", ")}`);
  const users = await User.find({ _id: { $in: partnerIds } }).select(
    "name profilePicture lastLogin",
  );

  const astrologers = await Astrologer.find({
    user_id: { $in: partnerIds },
  })
    .populate("user_id", "name profilePicture lastLogin")
    .select("display_name is_online updatedAt");

  const chatList = chats.map((chat) => {
    const astro = astrologers.find(
      (a) => a.user_id._id.toString() === chat._id.toString(),
    );
    if (astro) {
      return {
        userId: astro.user_id._id,
        displayName: astro.display_name || astro.user_id.name || "Unknown",
        profilePicture: astro.user_id.profilePicture || null,
        isOnline: astro.is_online || false,
        lastOnline: astro.user_id.lastLogin || astro.updatedAt || null,
      };
    }

    const user = users.find((u) => u._id.toString() === chat._id.toString());
    return {
      userId: user?._id,
      displayName: user?.name || "Unknown",
      profilePicture: user?.profilePicture || null,
      isOnline: false,
      lastOnline: user?.lastLogin || null,
    };
  });

  logger.info(`[CHAT LIST] Returning ${chatList.length} chat entries`);

  return {
    chats: chatList,
    pagination: buildPaginationResponse({
      totalDocs: totalDocs[0]?.count || 0,
      totalPages: Math.ceil((totalDocs[0]?.count || 0) / limit),
      page,
      limit,
    }),
  };
};

exports.getConversation = async (
  loginUserId,
  otherUserId,
  sessionId,
  page = 1,
  limit = 20,
) => {
  const skip = (page - 1) * limit;
  logger.info(
    `[CONVERSATION] Fetching conversation between loginUserId: ${loginUserId} and otherUserId: ${otherUserId}, page: ${page}, limit: ${limit}`,
  );
  if (
    !mongoose.Types.ObjectId.isValid(loginUserId) ||
    !mongoose.Types.ObjectId.isValid(otherUserId)
  ) {
    logger.warn(
      `[CONVERSATION] Invalid user ID(s) provided: loginUserId=${loginUserId}, otherUserId=${otherUserId}`,
    );
    throw new Error("Invalid user ID(s)");
  }
  const loginUserObjectId = new mongoose.Types.ObjectId(loginUserId);
  const otherUserObjectId = new mongoose.Types.ObjectId(otherUserId);
  const query = {
    $or: [
      { sender_id: loginUserObjectId, receiver_id: otherUserObjectId },
      { sender_id: otherUserObjectId, receiver_id: loginUserObjectId },
    ],
  };
  if (sessionId) {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new Error("Invalid session ID");
    }
    query.session_id = new mongoose.Types.ObjectId(sessionId);
  }

  logger.info(`[CONVERSATION] MongoDB query: ${JSON.stringify(query)}`);
  const totalDocs = await ChatMessage.countDocuments(query);
  const messages = await ChatMessage.find(query)
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .populate("sender_id", "name profilePicture role")
    .populate("receiver_id", "name profilePicture role");
  logger.info(
    `[CONVERSATION] Fetched ${messages.length} messages out of ${totalDocs} total`,
  );
  return {
    messages,
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit,
    }),
  };
};
