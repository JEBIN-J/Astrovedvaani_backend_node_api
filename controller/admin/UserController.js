const {
  createUserByAdmin,
  completeUser,
  toggleUserVerificationStatusService,
  fetchUsersWithDetails,
  blockStateUser,
  deleteUser,
  restoreUser,
  refreshUser,
  fetchSalarySlips,
} = require("../../services/admin/adminUserService");

const CacheService = require("../../utils/redis/cacheService");
const { Parser } = require("json2csv");
const mongoose = require("mongoose");

const logger = require("../../utils/logger");
const asyncHandler = require("../../middlewares/asyncHandler");
const Astrologer = require("../../models/Astrologer");
const BadRequestError = require("../../errors/badRequest");
const Enums = require("../../utils/constants");
const {
  getAllLanguages,
  getAllSpecializations,
} = require("../../services/admin/AstrologerSkillsService");
const Specialization = require("../../models/Specialization");
const Language = require("../../models/Language");
const SalarySlip = require("../../models/SalarySlip");
const { buildPaginationResponse } = require("../../utils/pagination");

exports.createUser = async (req, res) => {
  try {
    const { name, email, mobileNumber, role, password } = req.body;
    if (role === undefined || role === null) {
      throw new BadRequestError("Role is required");
    }
    if (role === Enums.USER.ROLE.SUPER_ADMIN) {
      throw new BadRequestError("Cannot create super admin user");
    }
    if (
      role === Enums.USER.ROLE.ADMIN &&
      req.user.role !== Enums.USER.ROLE.SUPER_ADMIN
    ) {
      throw new BadRequestError("Only super admin can create admin user");
    }
    if (email === undefined || email === null) {
      throw new BadRequestError("Email is required");
    }
   
    const result = await createUserByAdmin({
      name,
      email,
      mobileNumber,
      role,
      password,
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    logger.error("createUser error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.completeUser = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const { _id, id, createdAt, updatedAt, ...safeBody } = req.body;

  if (safeBody.specializations && !Array.isArray(safeBody.specializations)) {
    throw new BadRequestError("specializations must be an array");
  }
  if (safeBody.languages_spoken && !Array.isArray(safeBody.languages_spoken)) {
    throw new BadRequestError("languages_spoken must be an array");
  }

  if (safeBody.specializations?.length) {
    safeBody.specializations = await Promise.all(
      safeBody.specializations.map(async (val) => {
        if (mongoose.Types.ObjectId.isValid(val)) {
          return val;
        }
        const spec = await Specialization.findOneAndUpdate(
          { name: val.trim() },
          { name: val.trim() },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        return spec._id;
      }),
    );
  }
  if (safeBody.languages_spoken?.length) {
    safeBody.languages_spoken = await Promise.all(
      safeBody.languages_spoken.map(async (val) => {
        if (mongoose.Types.ObjectId.isValid(val)) {
          return val;
        }
        const lang = await Language.findOneAndUpdate(
          { name: val.trim() },
          { name: val.trim() },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        return lang._id;
      }),
    );
  }
  const result = await completeUser(userId, safeBody);
  return res.status(200).json({ success: true, ...result });
});

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.query;
    await deleteUser(userId);
    return res
      .status(200)
      .json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    logger.error("deleteUser error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.restoreUser = async (req, res) => {
  try {
    const { userId } = req.query;
    await restoreUser(userId);
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error("deleteUser error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.toggleUserVerificationStatus = async (req, res) => {
  try {
    const { userId } = req.query;
    const { newStatus } = req.body;
    await toggleUserVerificationStatusService(userId, newStatus);
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error("toggleUserVerificationStatus error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.fetchUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    role,
    verificationStatus,
    isActive,
    search,
    includeAstrologerDetails = false,
    sortBy = "createdAt",
    sortOrder = "desc",
    createdFrom,
    createdTo,
    lastLoginFrom,
    lastLoginTo,
    referredByCode,
    myReferralCode,
    exportCsv = "false",
    userId,
    astrologerId,
    isDeleted,

    is_online,
  } = req.query;

  const loginUserId = req.user._id;
  const loginUserRole = req.user.role;

  const filters = await buildUserFilters({
    role,
    verificationStatus,
    isActive,
    userId,
    createdFrom,
    createdTo,
    lastLoginFrom,
    lastLoginTo,
    referredByCode,
    myReferralCode,
    astrologerId,
    isDeleted,
  });

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    includeAstrologerDetails:
      includeAstrologerDetails === "true",
    sortBy,
    sortOrder,
    exportCsv: exportCsv === "true",
    searchTerm: search,

    // ✅ ADDED
    isOnline: is_online === "true",
  };

  let result = await fetchUsersWithDetails(
    filters,
    options,
    loginUserId,
    loginUserRole,
  );

  if (options.includeAstrologerDetails) {
    let cachedSpecializations =
      await CacheService.get(
        CacheService.CACHE_PREFIXES.USERS_LIST +
          ":specializations",
      );

    if (!cachedSpecializations) {
      cachedSpecializations = await getAllSpecializations({
        page: 1,
        limit: 1000,
      });

      await CacheService.set(
        CacheService.CACHE_PREFIXES.USERS_LIST +
          ":specializations",
        cachedSpecializations,
      );
    }

    let cachedLanguages =
      await CacheService.get(
        CacheService.CACHE_PREFIXES.USERS_LIST +
          ":languages",
      );

    if (!cachedLanguages) {
      cachedLanguages = await getAllLanguages({
        page: 1,
        limit: 1000,
      });

      await CacheService.set(
        CacheService.CACHE_PREFIXES.USERS_LIST +
          ":languages",
        cachedLanguages,
      );
    }

    // ONLY CHANGE
    result.data = result.data.map((user) => {
      if (user.astrologerDetails) {
        const specializationsPop = (
          user.astrologerDetails.specializations || []
        )
          .map(
            (id) =>
              cachedSpecializations.data.find(
                (s) =>
                  s._id.toString() === id.toString(),
              )?.name,
          )
          .filter(Boolean);

        const languagesPop = (
          user.astrologerDetails.languages_spoken || []
        )
          .map(
            (id) =>
              cachedLanguages.data.find(
                (l) =>
                  l._id.toString() === id.toString(),
              )?.name,
          )
          .filter(Boolean);

        const {
          verificationStatus,
          ...restUser
        } = user;

        return {
          ...restUser,
          astrologerDetails: {
            ...user.astrologerDetails,
            specializations: specializationsPop,
            languages_spoken: languagesPop,
            profilePicture: user.profilePicture,
            verificationStatus,
          },
        };
      }

      return user;
    });
  }

  if (options.exportCsv) {
    const { Parser } = require("json2csv");

    const fields = Object.keys(result.data[0] || {});

    const parser = new Parser({
      fields,
    });

    const csv = parser.parse(result.data);

    res.header("Content-Type", "text/csv");

    return res
      .attachment("users_export.csv")
      .send(csv);
  }

  return res.json({
    success: true,
    message: "Users fetched successfully",
    data: result.data,
    pagination: result.pagination,
  });
});

exports.blockUser = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    throw new BadRequestError("user id is required");
  }
  try {
    const result = await blockStateUser(userId);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error("blockUser error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

exports.refreshUser = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    throw new BadRequestError("user id is required");
  }
  try {
    const result = await refreshUser(userId);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error("refersh error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

async function buildUserFilters({
  role,
  verificationStatus,
  isActive,
  userId,
  createdFrom,
  createdTo,
  lastLoginFrom,
  lastLoginTo,
  referredByCode,
  myReferralCode,
  astrologerId,
  isDeleted,
}) {
  const filters = {};
  logger.info("Starting to build user filters");

  if (role !== undefined) {
    filters.role = parseInt(role);
    logger.info(`Filter applied: role = ${filters.role}`);
  }

  if (verificationStatus !== undefined) {
    filters.verificationStatus = parseInt(verificationStatus);
    logger.info(
      `Filter applied: verificationStatus = ${filters.verificationStatus}`,
    );
  }

  if (isActive !== undefined) {
    filters.isActive = isActive === "true" || isActive === true;
    logger.info(`Filter applied: isActive = ${filters.isActive}`);
  }

  if (isDeleted !== undefined) {
    filters.isDeleted = isDeleted === "true" || isDeleted === true;
    logger.info(`Filter applied: isActive = ${filters.isDeleted}`);
  }

  // Handle userId filter - takes precedence over astrologerId
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    filters._id = new mongoose.Types.ObjectId(userId);
    logger.info(
      `Filter applied: userId = ${userId} (takes precedence over astrologerId)`,
    );
    return filters;
  }

  if (createdFrom || createdTo) {
    filters.createdAt = {};
    if (createdFrom) {
      filters.createdAt.$gte = new Date(createdFrom);
      logger.info(`Filter applied: createdFrom >= ${filters.createdAt.$gte}`);
    }
    if (createdTo) {
      filters.createdAt.$lte = new Date(createdTo);
      logger.info(`Filter applied: createdTo <= ${filters.createdAt.$lte}`);
    }
  }

  if (lastLoginFrom || lastLoginTo) {
    filters.lastLogin = {};
    if (lastLoginFrom) {
      filters.lastLogin.$gte = new Date(lastLoginFrom);
      logger.info(`Filter applied: lastLoginFrom >= ${filters.lastLogin.$gte}`);
    }
    if (lastLoginTo) {
      filters.lastLogin.$lte = new Date(lastLoginTo);
      logger.info(`Filter applied: lastLoginTo <= ${filters.lastLogin.$lte}`);
    }
  }

  if (referredByCode) {
    filters.referredByCode = referredByCode;
    logger.info(`Filter applied: referredByCode = ${referredByCode}`);
  }

  if (myReferralCode) {
    filters.myReferralCode = myReferralCode;
    logger.info(`Filter applied: myReferralCode = ${myReferralCode}`);
  }

  // Handle astrologerId filter only if userId is not provided
  if (astrologerId && mongoose.Types.ObjectId.isValid(astrologerId)) {
    logger.info(`Looking up astrologer with ID: ${astrologerId}`);
    const astro = await Astrologer.findById(astrologerId)
      .select("user_id")
      .lean();
    if (astro && astro.user_id) {
      filters._id = astro.user_id;
      logger.info(
        `Filter applied: astrologerId resolved to userId = ${astro.user_id}`,
      );
    } else {
      filters._id = null; // ensure no results
      logger.info(
        `Astrologer not found or missing user_id for astrologerId = ${astrologerId}`,
      );
    }
  }
  filters.isDeleted = false;
  logger.info("Final filters object:", filters);
  return filters;
}

exports.getSalarySlips = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    monthYear,
    userId,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
    exportCsv = "false",
  } = req.query;

  // =====================================
  // FILTERS
  // =====================================
  const filters = {};

  if (monthYear) {
    filters.monthYear = monthYear;
  }

  if (userId) {
    filters.user_id = userId;
  }

  // =====================================
  // OPTIONS
  // =====================================
  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sortBy,
    sortOrder,
    exportCsv: exportCsv === "true",
    searchTerm: search,
  };

  // =====================================
  // FETCH
  // =====================================
  const result = await fetchSalarySlips(filters, options);

  // =====================================
  // CSV EXPORT
  // =====================================
  if (options.exportCsv) {
    const { Parser } = require("json2csv");

    const fields = [
      "slip_number",
      "month",
      "year",
      "total_earnings",
      "final_payout",
      "pdf_url",
    ];

    const parser = new Parser({ fields });

    const csv = parser.parse(result.data);

    res.header("Content-Type", "text/csv");

    return res.attachment("salary_slips.csv").send(csv);
  }

  // =====================================
  // RESPONSE
  // =====================================
  return res.status(200).json({
    success: true,
    message: "Salary slips fetched successfully",
    data: result.data,

    pagination: result.pagination
      ? buildPaginationResponse(result.pagination)
      : undefined,
  });
});
