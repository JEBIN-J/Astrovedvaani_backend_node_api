const AstrologerPriority = require("../../models/AstrologerPriority");
const Astrologer = require("../../models/Astrologer");
const mongoose = require("mongoose");
const AstrologerRanking = require("../../models/AstrologerRanking");

const FollowRequest = require("../../models/FollowRequest");
const CacheService = require("../../utils/redis/cacheService");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const Wallet = require("../../models/Wallet");
const User = require("../../models/User");
const WALLET_PROMO_THRESHOLD = 50;

exports.addAstrologerPriority = async ({ astrologer_ids, adminId }) => {
  if (!Array.isArray(astrologer_ids)) {
    astrologer_ids = [astrologer_ids]; // allow single also
  }

  return AstrologerPriority.findOneAndUpdate(
    {}, // ⚠️ EMPTY FILTER = same single document
    {
      $addToSet: {
        astrologer_ids: { $each: astrologer_ids }, // no duplicates
      },
      updated_by: adminId,
    },
    {
      upsert: true,
      new: true,
    },
  );
};

exports.updateAstrologerPriority = async ({ astrologer_ids, adminId }) => {
  if (!Array.isArray(astrologer_ids)) {
    astrologer_ids = [astrologer_ids];
  }

  // always work with single document
  const doc = await AstrologerPriority.findOne();

  if (!doc) {
    return AstrologerPriority.create({
      astrologer_ids,
      updated_by: adminId,
    });
  }

  doc.astrologer_ids = [...new Set(astrologer_ids.map(String))];
  doc.updated_by = adminId;

  await doc.save();
  return doc;
};

async function resolveShowPromotions(userId, role) {
  if (!userId) {
    logger.info(`[Promotion] no userId -> showPromotions=false`);
    return false;
  }

  if (role === Enums.USER.ROLE.SUPER_ADMIN) {
    return true;
  }

  const user = await User.findById(userId)
    .select("promotionalSessionUsed")
    .lean();

  if (!user) return false;

  if (user.promotionalSessionUsed) {
    logger.info(
      `[Promotion] userId=${userId}  promotionalSessionUsed=${user.promotionalSessionUsed} -> showPromotions=false (already used / not new user)`,
    );
    return false;
  }

  const wallet = await Wallet.findOne({ user_id: userId }).select("balance");
  const balance = wallet?.balance || 0;
  const eligible = balance <= WALLET_PROMO_THRESHOLD;
  logger.info(
    `[Promotion] userId=${userId} role=${role} walletBalance=${balance} showPromotions=${eligible}`,
  );
  return eligible;
}

exports.fetchAll = async ({
  limit = 20,
  cursor = null,
  filters = {},
  sortPrice,
  sortExperience,
  sortRating,
  gender,
  userId,
  role,
  search,
}) => {
  try {
    const priorityDoc = await AstrologerPriority.findOne()
      .select("astrologer_ids")
      .lean();

    if (!priorityDoc || !priorityDoc.astrologer_ids.length) {
      return { data: [], pagination: { hasMore: false, nextCursor: null } };
    }

    const priorityAstrologerIds = priorityDoc.astrologer_ids.map(String);

    const showPromotions = await resolveShowPromotions(userId, role);

    const now = new Date();

    const DEFAULT_SERVICE_TYPE = Enums.SERVICE.TYPE.CHAT;
    if (!filters["service_rates.service_type"]) {
      filters["service_rates.service_type"] = DEFAULT_SERVICE_TYPE;
    }

    let serviceTypeFilter = filters["service_rates.service_type"];
    let isFreeFilter;
    const rankingFilters = {};
    const astrologerMatchFilters = {};

    Object.entries(filters).forEach(([key, value]) => {
      if (key === "service_rates.service_type") {
        serviceTypeFilter = value;
      } else if (key === "is_free") {
        isFreeFilter = value;
      } else if (key.startsWith("astrologer.")) {
        astrologerMatchFilters[key.replace("astrologer.", "")] = value;
      } else {
        rankingFilters[key] = value;
      }
    });

    const pipeline = [];

    pipeline.push({
      $match: {
        astrologer_id: {
          $in: priorityAstrologerIds.map(
            (id) => new mongoose.Types.ObjectId(id),
          ),
        },
      },
    });

    if (cursor && !sortPrice && !sortExperience && !sortRating) {
      const cursorDoc =
        await AstrologerRanking.findById(cursor).select("score");
      if (cursorDoc) {
        pipeline.push({
          $match: {
            $or: [
              { score: { $lt: cursorDoc.score } },
              {
                score: cursorDoc.score,
                _id: { $gt: new mongoose.Types.ObjectId(cursor) },
              },
            ],
          },
        });
      }
    }

    pipeline.push(
      { $match: rankingFilters },

      {
        $lookup: {
          from: "astrologers",
          localField: "astrologer_id",
          foreignField: "_id",
          as: "astrologer",
        },
      },
      { $unwind: "$astrologer" },

      ...(Object.keys(astrologerMatchFilters).length
        ? [
            {
              $match: Object.fromEntries(
                Object.entries(astrologerMatchFilters).map(([k, v]) => [
                  `astrologer.${k}`,
                  v,
                ]),
              ),
            },
          ]
        : []),

      {
        $lookup: {
          from: "users",
          localField: "astrologer.user_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },

      {
        $match: {
          "user.isDeleted": false,
          "user.verificationStatus": Enums.USER.VERIFICATION_STATUS.APPROVED,
        },
      },

      ...(gender ? [{ $match: { "user.gender": parseInt(gender) } }] : []),

      {
        $lookup: {
          from: "astrologerservicerates",
          localField: "astrologer._id",
          foreignField: "astrologer_id",
          as: "service_rates",
        },
      },

      ...(serviceTypeFilter !== null
        ? [
            {
              $match: {
                service_rates: {
                  $elemMatch: { service_type: serviceTypeFilter },
                },
              },
            },
          ]
        : []),

      {
        $lookup: {
          from: "consultationsessions",
          localField: "astrologer.user_id",
          foreignField: "astrologer_user_id",
          as: "sessions",
        },
      },

      ...(isFreeFilter !== undefined
        ? [{ $match: { "sessions.is_free": isFreeFilter } }]
        : []),

      ...(showPromotions
        ? [
            {
              $lookup: {
                from: "promotions",
                let: { astrologerId: "$astrologer._id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $in: ["$$astrologerId", "$astrologers"] },
                          { $eq: ["$isActive", true] },
                          { $lte: ["$startDate", now] },
                          { $gte: ["$endDate", now] },
                        ],
                      },
                    },
                  },
                  { $limit: 1 },
                  {
                    $project: {
                      _id: 1,
                      title: 1,
                      services: 1,
                      startDate: 1,
                      endDate: 1,
                    },
                  },
                ],
                as: "promotion",
              },
            },
            {
              $unwind: {
                path: "$promotion",
                preserveNullAndEmptyArrays: true,
              },
            },
          ]
        : []),
    );

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "astrologer.display_name": { $regex: search, $options: "i" } },
            { "user.name": { $regex: search, $options: "i" } },
            { "astrologer.bio": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    pipeline.push({
      $addFields: {
        priorityIndex: {
          $indexOfArray: [
            priorityAstrologerIds,
            { $toString: "$astrologer_id" },
          ],
        },
      },
    });

    pipeline.push({
      $project: {
        _id: 1,
        ratings_avg: 1,
        priorityIndex: 1,
        astrologer: {
          $mergeObjects: [
            "$astrologer",
            {
              display_name: {
                $ifNull: ["$astrologer.display_name", "$user.name"],
              },
              profilePicture: {
                $ifNull: ["$user.profilePicture", null],
              },
            },
          ],
        },
        user: 1,
        service_rates: 1,
        score: 1,
        promotion: 1,
      },
    });

    if (sortPrice) {
      pipeline.push({
        $sort: {
          "astrologer.is_online": -1,
          priorityIndex: 1,
          "service_rates.rate": sortPrice === "asc" ? 1 : -1,
        },
      });
    } else if (sortExperience) {
      pipeline.push({
        $sort: {
          "astrologer.is_online": -1,
          priorityIndex: 1,
          "astrologer.experience_years": sortExperience === "asc" ? 1 : -1,
        },
      });
    } else if (sortRating) {
      pipeline.push({
        $sort: {
          "astrologer.is_online": -1,
          priorityIndex: 1,
          ratings_avg: sortRating === "asc" ? 1 : -1,
        },
      });
    } else {
      pipeline.push({
        $sort: {
          "astrologer.is_online": -1,
          priorityIndex: 1,
          score: -1,
          _id: 1,
        },
      });
    }

    pipeline.push({ $limit: limit + 1 });

    const result = await AstrologerRanking.aggregate(pipeline);

    const hasMore = result.length > limit;
    const data = hasMore ? result.slice(0, limit) : result;

    const formattedData = data.map((r) => ({
      ...r,
      promotion: r.promotion || null,
    }));

    return {
      data: formattedData,
      pagination: {
        hasMore,
        nextCursor: formattedData.at(-1)?._id || null,
      },
    };
  } catch (err) {
    logger.error("fetchAstrologers error:", err);
    return { data: [], pagination: { hasMore: false, nextCursor: null } };
  }
};
