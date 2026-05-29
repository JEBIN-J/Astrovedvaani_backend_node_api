const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../../models/User");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const { createWallet } = require("../walletService");
const Astrologer = require("../../models/Astrologer");
const Specialization = require("../../models/Specialization");
const Language = require("../../models/Language");
const AstrologerServiceRates = require("../../models/AstrologerServiceRates");
const CacheService = require("../../utils/redis/cacheService");
const { buildPaginationResponse } = require("../../utils/pagination");
const { generatePassword } = require("../../utils/generatePassword");
const { sendUserPassword } = require("../communication/userPasswordMail");
const { sendWelcomeEmail } = require("../communication/welcomeMail");
const FollowRequest = require("../../models/FollowRequest");
const { createRazorpayFundAccount } = require("../webhookService");
const { notifyUsers } = require("../notification/notifyService");
const {
  NotFoundError,
  BadRequestError,
  ValidationError,
  ApiError,
} = require("../../errors");
const Wallet = require("../../models/Wallet");
const WalletLedger = require("../../models/Ledger");
const SalarySlip = require("../../models/SalarySlip");
const { CACHE_PREFIXES, ASTROLOGER_TTL, DEFAULT_TTL, SERVICE_RATES_TTL } =
  CacheService;
const ASTROLOGER_CACHE_PREFIX = "astro:list";

async function getAstrologerMonthlyEarnings(userId) {
  try {
    const wallet = await Wallet.findOne({
      user_id: userId,
    }).lean();

    if (!wallet) {
      return 0;
    }

    const now = new Date();

    // current month start
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // next month start
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const currentMonthAgg = await WalletLedger.aggregate([
      {
        $match: {
          wallet_id: wallet._id,

          direction: Enums.TRANSACTION.DIRECTION.CREDIT,

          payment_status: Enums.PAYMENT.STATUS.PAID,

          createdAt: {
            $gte: currentMonthStart,
            $lt: nextMonthStart,
          },
        },
      },
      {
        $group: {
          _id: null,

          total: {
            $sum: "$amount",
          },
        },
      },
    ]);

    return Number(currentMonthAgg[0]?.total || 0);
  } catch (error) {
    console.error("getAstrologerMonthlyEarnings Error:", error);

    return 0;
  }
}
const createUserByAdmin = async ({
  name,
  email,
  mobileNumber,
  role,
  password,
}) => {
  try {
    if (
      role !== Enums.USER.ROLE.SUPER_ADMIN &&
      role === Enums.USER.ROLE.SUPER_ADMIN
    ) {
      throw new Error("Only super admin can create super admin user");
    }
    const existingUser = await User.findOne({
      $and: [{ $or: [{ email }, { mobileNumber }] }, { isDeleted: false }],
    });

    if (existingUser) throw new Error("User already exists");
    const plainPassword = password || generatePassword();
    logger.info(` user password :${plainPassword}`);
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const user = new User({
      name,
      email,
      mobileNumber,
      password: hashedPassword,
      loginMethod: Enums.USER.LOGIN_METHOD.PASSWORD,
      role,
      isActive: true,
      verificationStatus: Enums.USER.VERIFICATION_STATUS.PENDING,
    });
    await user.save();
    await createWallet(user._id);
    if (role === Enums.USER.ROLE.ASTROLOGER) {
      await Astrologer.create({
        user_id: user._id,
        display_name: name,
        bio: "",
        profilePicture: null,
        specializations: [],
        languages_spoken: [],
        experience_years: 0,
        calendar_availability: {},
        timezone: null,
        is_online: false,
        isChat: false,
        isCall: false,
        isVideo: false,
        is_premium: false,
        is_busy: false,
        premium_expiry: null,
        premium_boost: 0,
        kyc_details: {},
      });
    }
    await CacheService.clearUserRelatedCaches(user._id);
    sendUserPassword({ email, password: plainPassword, name });
    logger.info(`[OTP Verification] Triggering welcome email for ${email}`);

    sendWelcomeEmail({
      email: user.email,
      name: user.name || "User",
      role: user.role,
    })
      .then(() => {
        logger.info(
          "[OTP Verification] Welcome email sent successfully (background)",
        );
      })
      .catch((err) => {
        logger.error(
          `[OTP Verification] Failed to send welcome email: ${err.message}`,
          { stack: err.stack },
        );
      });

    return {
      message: `${
        Enums.USER.ROLE_NAMES?.[role] || "User"
      } created successfully`,
      userId: user._id,
    };
  } catch (error) {
    throw error;
  }
};

const completeUser = async (userId, data) => {
  try {
    logger.info(`Starting profile completion | userId=${userId}`);

    const user = await User.findById(userId);
    if (!user || user.role !== Enums.USER.ROLE.ASTROLOGER) {
      throw new BadRequestError("Invalid astrologer user.");
    }

    const userUpdate = {};

    if (data.profilePicture) userUpdate.profilePicture = data.profilePicture;
    if (data.gender) userUpdate.gender = data.gender;
    if (data.password) {
      const plainPassword = data.password;
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      userUpdate.password = hashedPassword;
    }
    // --- Validate specializations ---
    if (
      Array.isArray(data.specializations) &&
      data.specializations.length > 0
    ) {
      const existingSpecs = await Specialization.find({
        _id: { $in: data.specializations },
      });
      if (existingSpecs.length !== data.specializations.length) {
        throw new ValidationError(
          "Some specializations do not exist. Provide valid IDs.",
        );
      }
    }

    // --- Validate languages ---
    if (
      Array.isArray(data.languages_spoken) &&
      data.languages_spoken.length > 0
    ) {
      const existingLangs = await Language.find({
        _id: { $in: data.languages_spoken },
      });
      if (existingLangs.length !== data.languages_spoken.length) {
        throw new ValidationError(
          "Some languages do not exist. Provide valid IDs.",
        );
      }
    }

    // --- Validate services ---
    const validServiceTypes = Object.values(Enums.SERVICE.TYPE);
    if (Array.isArray(data.services)) {
      for (const service of data.services) {
        if (!validServiceTypes.includes(service.service_type)) {
          throw new ValidationError(
            `Invalid service_type: ${service.service_type}`,
          );
        }
      }
    }

    // --- Update astrologer profile ---
    const astrologer = await Astrologer.findOneAndUpdate(
      { user_id: userId },
      {
        $set: {
          ...data,
          updatedAt: new Date(),
          isChat:
            data.services?.some(
              (s) => s.service_type === Enums.SERVICE.TYPE.CHAT,
            ) || false,
          isVideo:
            data.services?.some(
              (s) => s.service_type === Enums.SERVICE.TYPE.VIDEO,
            ) || false,
          isCall:
            data.services?.some(
              (s) => s.service_type === Enums.SERVICE.TYPE.CALL,
            ) || false,
        },
      },
      { upsert: true, new: true },
    );

    // --- Handle service rates ---
    if (Array.isArray(data.services)) {
      if (data.services.length > 0) {
        const bulkOps = data.services.map((s) => ({
          updateOne: {
            filter: {
              astrologer_id: astrologer._id,
              service_type: s.service_type,
            },
            update: { $set: { ...s, updatedAt: new Date() } },
            upsert: true,
          },
        }));
        await AstrologerServiceRates.bulkWrite(bulkOps);
      } else {
        await AstrologerServiceRates.deleteMany({
          astrologer_id: astrologer._id,
        });
      }
    }

    // --- Handle verification logic ---
    if (typeof data.verificationStatus !== "undefined") {
      if (
        data.verificationStatus === Enums.USER.VERIFICATION_STATUS.APPROVED &&
        user.verificationStatus !== Enums.USER.VERIFICATION_STATUS.APPROVED
      ) {
        const dbAstrologer = await Astrologer.findOne({ user_id: userId });
        if (!dbAstrologer)
          throw new NotFoundError("Astrologer profile not found.");

        const dbServicesCount = await AstrologerServiceRates.countDocuments({
          astrologer_id: dbAstrologer._id,
        });

        const hasKYC =
          dbAstrologer?.kyc_details &&
          Object.keys(dbAstrologer.kyc_details).length > 0;

        if (!hasKYC)
          throw new BadRequestError("Cannot approve: Missing KYC details.");
        if (dbServicesCount === 0)
          throw new BadRequestError("Cannot approve: Missing service rates.");

        userUpdate.verificationStatus = Enums.USER.VERIFICATION_STATUS.APPROVED;
        userUpdate.isOnboarded = true;

        // --- Async background task ---
        setImmediate(async () => {
          try {
            await createRazorpayFundAccount(dbAstrologer);
            const usersToNotify = await User.find({
              role: 100,
              isActive: true,
            }).lean();
            await notifyUsers(
              usersToNotify,
              "New Astrologer Available!",
              `${
                dbAstrologer.display_name || "An astrologer"
              } is now verified.`,
              {
                type: "NEW_ASTROLOGER",
                astrologerId: dbAstrologer._id,
              },
            );
          } catch (err) {
            logger.error(
              `Background error | astrologerId=${dbAstrologer._id} | ${err.message}`,
            );
            await Astrologer.findByIdAndUpdate(dbAstrologer._id, {
              razorpay_setup_failed: true,
            });
          }
        });
      } else {
        userUpdate.verificationStatus = data.verificationStatus;
      }
    }

    // --- Update user record ---
    if (Object.keys(userUpdate).length > 0) {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: userUpdate },
        { new: true },
      );
      if (data.profilePicture) {
        sendWelcomeEmail(updatedUser.email, updatedUser.name, updatedUser.role);
      }
    }

    await CacheService.clearUserRelatedCaches(userId);
    await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);

    return { astrologer, message: "Profile completed successfully." };
  } catch (error) {
    logger.error(
      `Error completing profile | userId=${userId}, message=${error.message}`,
    );
    // If it's not one of your custom ApiErrors, wrap it in a generic one
    if (!(error instanceof ApiError)) {
      throw new BadRequestError(error.message);
    }
    throw error;
  }
};

const toggleUserVerificationStatusService = async (userId, newStatus) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  const validStatuses = Object.values(Enums.USER.VERIFICATION_STATUS);
  if (newStatus && !validStatuses.includes(newStatus)) {
    throw new Error("Invalid verification status provided");
  }
  const updatedStatus = newStatus
    ? newStatus
    : user.verificationStatus === Enums.USER.VERIFICATION_STATUS.APPROVED
      ? Enums.USER.VERIFICATION_STATUS.PENDING
      : Enums.USER.VERIFICATION_STATUS.APPROVED;

  user.verificationStatus = updatedStatus;
  await user.save();
  await CacheService.clearUserRelatedCaches(userId);

  return {
    message: `User verification status changed to ${updatedStatus}`,
  };
};

async function fetchUsersWithDetails(
  filters = {},
  options = {},
  loginUserId,
  loginUserRole,
) {
  const {
    page = 1,
    limit = 10,
    includeAstrologerDetails = false,
    sortBy = "createdAt",
    sortOrder = "desc",
    searchTerm,
    exportCsv = false,
  } = options;

  const pipeline = [];
  pipeline.push({ $match: filters });

  if (loginUserRole === Enums.USER.ROLE.ADMIN) {
    pipeline.push({
      $match: {
        role: { $nin: [Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN] },
        _id: { $ne: loginUserId },
      },
    });
  }

  // Lookup astrologer details if needed
  if (includeAstrologerDetails || searchTerm) {
    pipeline.push({
      $lookup: {
        from: "astrologers",
        localField: "_id",
        foreignField: "user_id",
        as: "astro",
      },
    });

    // Unwind astrologers to enable searching inside fields like display_name
    pipeline.push({
      $unwind: {
        path: "$astro",
        preserveNullAndEmptyArrays: true, // Keep users without astrologers
      },
    });
  }

  // Apply search
  if (searchTerm) {
    const s = searchTerm.trim();
    pipeline.push({
      $match: {
        $or: [
          { name: { $regex: s, $options: "i" } },
          { email: { $regex: s, $options: "i" } },
          { mobileNumber: { $regex: s, $options: "i" } },
          { "astro.display_name": { $regex: s, $options: "i" } },
          { "astro.specializations": { $regex: s, $options: "i" } },
          { "astro.languages_spoken": { $regex: s, $options: "i" } },
        ],
      },
    });
  }

  // Sorting
  pipeline.push({
    $sort: { [sortBy]: sortOrder === "asc" ? 1 : -1 },
  });

  // Save a copy of pipeline before pagination to count total documents
  const countPipeline = [...pipeline];

  // Pagination (skip & limit) only if not exporting CSV
  if (!exportCsv) {
    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: limit });
  }

  // Exclude sensitive fields
  pipeline.push({
    $project: {
      password: 0,
      "apiKeys.secret": 0,
    },
  });

  // Execute aggregation
  const users = await User.aggregate(pipeline).exec();

  // Count total for paginat
  // ion (after search & lookup)
  let totalCount;
  if (exportCsv) {
    totalCount = users.length;
  } else {
    // Remove skip & limit and $project for counting
    countPipeline.push({ $count: "total" });
    const countResult = await User.aggregate(countPipeline).exec();
    totalCount = countResult[0]?.total || 0;
  }

  let enriched = users;

  // Add astrologer service rates if requested
  if (includeAstrologerDetails) {
    const astroList = users.map((u) => u.astro).filter(Boolean);
    const astroIds = astroList.map((a) => a._id);

    const serviceRates = await AstrologerServiceRates.find({
      astrologer_id: { $in: astroIds },
    }).lean();

    const rateMap = serviceRates.reduce((acc, rate) => {
      const key = rate.astrologer_id.toString();
      acc[key] = acc[key] || [];
      acc[key].push(rate);
      return acc;
    }, {});

    enriched = users.map((u) => {
      const astro = u.astro || null;
      if (astro) {
        astro.services = rateMap[astro._id.toString()] || [];
      }
      const { astro: _omitAstro, ...rest } = u;
      return {
        ...rest,
        astrologerDetails: astro || null,
      };
    });
  }

  // Add followers/following counts
  enriched = await Promise.all(
    enriched.map(async (u) => {
      const followersCount = await FollowRequest.countDocuments({
        astrologer_id: u._id,
      });
      const followingCount = await FollowRequest.countDocuments({
        user_id: u._id,
      });
      let currentMonthEarning = 0;

      if (u.role === Enums.USER.ROLE.ASTROLOGER) {
        currentMonthEarning = await getAstrologerMonthlyEarnings(u._id);
      }
      return {
        ...u,
        followersCount,
        followingCount,
        currentMonthEarning,
      };
    }),
  );

  // Build pagination response
  const pagination = exportCsv
    ? undefined
    : buildPaginationResponse({
        totalDocs: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        page,
        limit,
      });

  return { data: enriched, pagination };
}

const blockStateUser = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");
    user.isBlock = !user.isBlock;
    await user.save();
    await CacheService.clearUserRelatedCaches?.(userId);
    return {
      message: `User has been ${user.isBlock ? "blocked" : "unblocked"}`,
    };
  } catch (error) {
    throw new Error(`Error toggling block state: ${error.message}`);
  }
};
const deleteUser = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");
    if (user.isDeleted) throw new Error("User already deleted");

    const timestamp = Date.now();

    // --- Soft delete the User ---
    user.email = user.email
      ? `${user.email}__deleted_${timestamp}`
      : `deleted_${timestamp}@deleted.com`;
    user.mobileNumber = user.mobileNumber
      ? `${user.mobileNumber}__deleted_${timestamp}`
      : `deleted_${timestamp}`;
    if (user.myReferralCode)
      user.myReferralCode = `${user.myReferralCode}__deleted_${timestamp}`;
    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    // --- If astrologer, mark their astrologer profile & service rates as deleted ---
    if (user.role === Enums.USER.ROLE.ASTROLOGER) {
      const astrologer = await Astrologer.findOne({ user_id: userId });
      if (astrologer) {
        const astroTimestamp = Date.now();

        // Rename potentially unique fields to avoid re-registration conflicts
        if (astrologer.display_name) {
          astrologer.display_name = `${astrologer.display_name}__deleted_${astroTimestamp}`;
        }
        if (astrologer.email) {
          astrologer.email = `${astrologer.email}__deleted_${astroTimestamp}`;
        }
        if (astrologer.mobileNumber) {
          astrologer.mobileNumber = `${astrologer.mobileNumber}__deleted_${astroTimestamp}`;
        }

        astrologer.isDeleted = true;
        astrologer.deletedAt = new Date();
        await astrologer.save();

        // Mark related service rates as deleted (if applicable)
        await AstrologerServiceRates.updateMany(
          { astrologer_id: astrologer._id },
          {
            $set: {
              isDeleted: true,
              deletedAt: new Date(),
            },
          },
        );
      }
    }

    await CacheService.clearUserRelatedCaches?.(userId);
    await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);

    return {
      message: "User and related astrologer data soft-deleted successfully",
    };
  } catch (error) {
    throw new Error(`Error deleting user: ${error.message}`);
  }
};

const restoreUser = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");
    if (!user.isDeleted) throw new Error("User is not deleted");

    // Remove the __deleted_<timestamp> suffix if present
    const deletedSuffixRegex = /__deleted_\d+$/;

    if (user.email) user.email = user.email.replace(deletedSuffixRegex, "");
    if (user.mobileNumber)
      user.mobileNumber = user.mobileNumber.replace(deletedSuffixRegex, "");
    if (user.myReferralCode)
      user.myReferralCode = user.myReferralCode.replace(deletedSuffixRegex, "");

    user.isDeleted = false;
    user.deletedAt = null;

    await user.save();

    await CacheService.clearUserRelatedCaches?.(userId);
    await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);

    return { message: `User has been restored successfully` };
  } catch (error) {
    throw new Error(`Error restoring user: ${error.message}`);
  }
};

const refreshUser = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");
    if (user.isDeleted) throw new Error("User is  deleted");
    const plainPassword = generatePassword();
    logger.info(` user id : ${userId} password :${plainPassword}`);
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    user.password = hashedPassword;
    await user.save();
    sendUserPassword({
      email: user.email,
      password: plainPassword,
      name: user.name,
    });
    await CacheService.clearUserRelatedCaches?.(userId);
    await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);

    return { message: `User has been restored successfully` };
  } catch (error) {
    throw new Error(`Error restoring user: ${error.message}`);
  }
};

const getUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError("User not found");
  return user;
};

const updateUserById = async (userId, updateData) => {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError("User not found");
  delete updateData.role;
  // delete updateData.password;
  delete updateData.email; // optional: comment out if editable

  Object.assign(user, updateData);
  await user.save();
  return user.toObject();
};

const fetchSalarySlips = async (filters = {}, options = {}) => {
  const {
    page = 1,

    limit = 10,

    sortBy = "createdAt",

    sortOrder = "desc",

    searchTerm,

    exportCsv = false,
  } = options;

  // =====================================
  // SAFE FILTERS
  // =====================================
  const safeFilters = {};

  // =====================================
  // MONTH-YEAR FILTER
  // FORMAT => 05-2026
  // =====================================
  if (filters.monthYear) {
    const [month, year] = filters.monthYear.split("-");

    if (month) {
      safeFilters.month = Number(month);
    }

    if (year) {
      safeFilters.year = Number(year);
    }
  }

  // =====================================
  // USER ID FILTER
  // =====================================
  // =====================================
  // USER ID / ASTROLOGER ID FILTER
  // =====================================
  if (filters.user_id) {
    const astrologer = await Astrologer.findById(filters.user_id).select(
      "user_id",
    );

    if (astrologer) {
      safeFilters.user_id = astrologer.user_id;
    } else {
      safeFilters.user_id = new mongoose.Types.ObjectId(filters.user_id);
    }
  }

  // =====================================
  // PIPELINE
  // =====================================
  const pipeline = [];

  // =====================================
  // MATCH
  // =====================================
  pipeline.push({
    $match: safeFilters,
  });

  // =====================================
  // USER LOOKUP
  // =====================================
  pipeline.push({
    $lookup: {
      from: "users",

      localField: "user_id",

      foreignField: "_id",

      as: "user",
    },
  });

  // =====================================
  // UNWIND
  // =====================================
  pipeline.push({
    $unwind: {
      path: "$user",

      preserveNullAndEmptyArrays: true,
    },
  });

  // =====================================
  // SEARCH
  // =====================================
  if (searchTerm) {
    const s = searchTerm.trim();

    pipeline.push({
      $match: {
        $or: [
          {
            "user.name": {
              $regex: s,
              $options: "i",
            },
          },

          {
            "user.email": {
              $regex: s,
              $options: "i",
            },
          },

          {
            slip_number: {
              $regex: s,
              $options: "i",
            },
          },
        ],
      },
    });
  }

  // =====================================
  // SORT
  // =====================================
  pipeline.push({
    $sort: {
      [sortBy]: sortOrder === "asc" ? 1 : -1,
    },
  });

  // =====================================
  // COUNT PIPELINE
  // =====================================
  const countPipeline = JSON.parse(JSON.stringify(pipeline));

  // =====================================
  // PAGINATION
  // =====================================
  if (exportCsv !== true) {
    pipeline.push({
      $skip: (Number(page) - 1) * Number(limit),
    });

    pipeline.push({
      $limit: Number(limit),
    });
  }

  // =====================================
  // PROJECT
  // =====================================
  pipeline.push({
    $project: {
      slip_number: 1,

      month: 1,

      year: 1,

      total_chat_minutes: 1,

      total_call_minutes: 1,

      total_chat_earnings: {
        $round: ["$total_chat_earnings", 0],
      },

      total_call_earnings: {
        $round: ["$total_call_earnings", 0],
      },

      total_earnings: {
        $round: ["$total_earnings", 0],
      },

      final_payout: {
        $round: ["$final_payout", 0],
      },

      pdf_url: 1,

      createdAt: 1,

      user: {
        _id: "$user._id",

        name: "$user.name",

        email: "$user.email",

        mobileNumber: "$user.mobileNumber",

        profilePicture: "$user.profilePicture",
      },
    },
  });

  // =====================================
  // EXECUTE
  // =====================================
  const salarySlips = await SalarySlip.aggregate(pipeline);

  // =====================================
  // TOTAL COUNT
  // =====================================
  let totalCount = 0;

  if (exportCsv === true) {
    totalCount = salarySlips.length;
  } else {
    countPipeline.push({
      $count: "total",
    });

    const countResult = await SalarySlip.aggregate(countPipeline);

    totalCount = countResult?.[0]?.total || 0;
  }

  // =====================================
  // PAGINATION RESPONSE
  // =====================================
  const pagination =
    exportCsv === true
      ? undefined
      : {
          totalDocs: totalCount,

          totalPages: Math.ceil(totalCount / Number(limit)),

          page: Number(page),

          limit: Number(limit),
        };

  // =====================================
  // RETURN
  // =====================================
  return {
    data: salarySlips,

    pagination,
  };
};
module.exports = {
  createUserByAdmin,
  completeUser,
  fetchUsersWithDetails,
  toggleUserVerificationStatusService,
  blockStateUser,
  deleteUser,
  restoreUser,
  refreshUser,
  getUserById,
  updateUserById,
  fetchSalarySlips,
};
