const Feedback = require("../../models/Feedback");
const SalarySlip = require("../../models/SalarySlip");
const User = require("../../models/User");
const logger = require("../../utils/logger");
const { buildPaginationResponse } = require("../../utils/pagination");

exports.fetchUserDetailsById = async (userId) => {
  try {
    const user = await User.findById(userId)
      .select("-password -apiKeys.secret")
      .lean();

    if (!user) return null;
    const normalizedUser = {
      _id: user._id,
      name: user.name || null,
      gender: user.gender ?? null,
      mobileNumber: user.mobileNumber || null,
      email: user.email || null,
      birthDate: user.birthDate || null,
      birthTime: user.birthTime || null,
      birthPlace: user.birthPlace || null,
      profilePicture: user.profilePicture || null,
      followersCount: user.followersCount || 0,
      followingCount: user.followingCount || 0,
      relationship_status: user.relationship_status ?? null,
      role: user.role ?? null,
      isActive: user.isActive ?? null,
      isNewUser: user.isNewUser ?? null,
      lastLogin: user.lastLogin || null,
      referredByCode: user.referredByCode || null,
      myReferralCode: user.myReferralCode || null,
      apiKeys: user.apiKeys || [],
      aiConfig: user.aiConfig || null,
      verificationStatus: user.verificationStatus ?? null,
      createdBy: user.createdBy || null,
      description: user.description || null,
      createdAt: user.createdAt || null,
      updatedAt: user.updatedAt || null,
    };

    return normalizedUser;
  } catch (err) {
    logger.error("Error in fetchUserDetailsById:", err);
    return null;
  }
};

exports.getFeedbackForAstrologer = async (
  astrologerUserId,
  page = 1,
  limit = 10,
  filters = {},
) => {
  logger.info("[getFeedbackForAstrologer] Called", {
    astrologerUserId,
    page,
    limit,
    filters,
  });

  const skip = (page - 1) * limit;
  const query = { astrologer_user_id: astrologerUserId };

  if (filters.source_type !== undefined) {
    query.source_type = parseInt(filters.source_type, 10);
  }
  if (filters.rating !== undefined) {
    query.rating = parseInt(filters.rating, 10);
  }
  if (filters.from_date || filters.to_date) {
    query.reviewed_at = {};
    if (filters.from_date) {
      query.reviewed_at.$gte = new Date(filters.from_date);
    }
    if (filters.to_date) {
      const end = new Date(filters.to_date);
      end.setDate(end.getDate() + 1);
      query.reviewed_at.$lte = end;
    }
  } else if (filters.duration && filters.duration !== "all") {
    const now = new Date();
    let fromDate;
    switch (filters.duration) {
      case "week":
        fromDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "month":
        fromDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        throw new BadRequestError("Invalid duration filter");
    }
    query.reviewed_at = { $gte: fromDate };
  }
  let sortOption = { reviewed_at: -1 };
  if (filters.sort_by === "rating_high") sortOption = { rating: -1 };
  if (filters.sort_by === "rating_low") sortOption = { rating: 1 };
  if (filters.sort_by === "oldest") sortOption = { reviewed_at: 1 };

  const [feedbacks, totalDocs] = await Promise.all([
    Feedback.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate("user_id", "name email")
      .lean(),
    Feedback.countDocuments(query),
  ]);

  return {
    feedbacks,
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit,
    }),
  };
};
exports.fetchMySalarySlips = async (userId, options = {}) => {
  const {
    page = 1,

    limit = 10,

    monthYear,

    sortBy = "createdAt",

    sortOrder = "desc",
  } = options;

  // =====================================
  // FILTERS
  // =====================================
  const filters = {
    user_id: userId,
  };

  // =====================================
  // MONTH-YEAR FILTER
  // FORMAT => 05-2026
  // =====================================
  if (monthYear) {
    const [month, year] = monthYear.split("-");

    if (month) {
      filters.month = Number(month);
    }

    if (year) {
      filters.year = Number(year);
    }
  }

  // =====================================
  // PAGINATION
  // =====================================
  const skip = (Number(page) - 1) * Number(limit);

  // =====================================
  // FETCH
  // =====================================
  const [salarySlips, total] = await Promise.all([
    SalarySlip.find(filters)
      .populate({
        path: "user_id",

        select: "name email mobileNumber profilePicture",
      })
      .sort({
        [sortBy]: sortOrder === "asc" ? 1 : -1,
      })
      .skip(skip)
      .limit(Number(limit))
      .lean(),

    SalarySlip.countDocuments(filters),
  ]);

  // =====================================
  // ROUND OFF
  // =====================================
  const formattedSlips = salarySlips.map((item) => ({
    ...item,

    total_earnings: Math.round(Number(item.total_earnings || 0)),

    final_payout: Math.round(Number(item.final_payout || 0)),

    total_chat_earnings: Math.round(Number(item.total_chat_earnings || 0)),

    total_call_earnings: Math.round(Number(item.total_call_earnings || 0)),
  }));

  // =====================================
  // PAGINATION
  // =====================================
  const pagination = {
    totalDocs: total,

    totalPages: Math.ceil(total / Number(limit)),

    page: Number(page),

    limit: Number(limit),
  };

  // =====================================
  // RETURN
  // =====================================
  return {
    data: formattedSlips,

    pagination,
  };
};
