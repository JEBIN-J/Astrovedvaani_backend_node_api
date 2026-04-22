const {
  createTraditionByAdmin,
  updateTraditionByAdmin,
  deleteTraditionByAdmin,
  fetchTraditionsWithDetails,
  fetchTraditionByIdOrSlug,
  toggleTraditionStatusByAdmin,
} = require("../../services/admin/traditionService");

const { ValidationError } = require("../../errors");
const logger = require("../../utils/logger");
const asyncHandler = require("../../middlewares/asyncHandler");
const mongoose = require("mongoose");

// ✅ CREATE / UPDATE
exports.createTradition = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { id, ...data } = req.body;

    if (!data.created_by) {
      data.created_by = userId;
    }

    if (data.date) {
      const parsedDate = new Date(data.date);
      data.date = parsedDate;
      data.month = parsedDate.toLocaleString("en-US", { month: "long" });
    }

    const result = id
      ? await updateTraditionByAdmin(id, data, userId)
      : await createTraditionByAdmin(data, userId);

    return res.status(id ? 200 : 201).json({
      success: true,
      message: id
        ? "Tradition updated successfully"
        : "Tradition created successfully",
      data: result.tradition,
    });
  } catch (err) {
    next(err);
  }
});

// ✅ UPDATE (separate)
exports.updateTradition = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const id = req.query.id;

    const result = await updateTraditionByAdmin(id, req.body, userId);

    res.status(200).json({
      success: true,
      message: "Tradition updated successfully",
      data: result.tradition,
    });
  } catch (err) {
    next(err);
  }
});

// ✅ FETCH ALL
exports.fetchTraditions = asyncHandler(async (req, res, next) => {
  try {
    const {
      page = "1",
      limit = "10",
      type,
      paksha,
      tithi,
      month,
      createdFrom,
      createdTo,
      createdBy,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filters = await buildTraditionFilters({
      type,
      paksha,
      tithi,
      month,
      createdFrom,
      createdTo,
      createdBy,
      search,
    });

    const { data, total } = await fetchTraditionsWithDetails(filters, {
      page: Number(page),
      limit: Number(limit),
      sortBy,
      sortOrder,
    });

    res.status(200).json({
      success: true,
      message: "Traditions fetched successfully",
      data,
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        pageSize: Number(limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ✅ FETCH BY ID / SLUG
exports.fetchTraditionByIdOrSlug = asyncHandler(async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;

    const tradition = await fetchTraditionByIdOrSlug(idOrSlug);

    if (!tradition) {
      throw new ValidationError("Tradition not found", 404);
    }

    res.status(200).json({
      success: true,
      data: tradition,
    });
  } catch (err) {
    next(err);
  }
});

// ✅ TOGGLE STATUS
exports.toggleTraditionStatus = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const id = req.query.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError("Invalid ID", 400);
    }

    const tradition = await toggleTraditionStatusByAdmin(id, userId);

    res.status(200).json({
      success: true,
      message: "Tradition status toggled successfully",
      data: tradition,
    });
  } catch (err) {
    next(err);
  }
});

// ✅ DELETE
exports.deleteTradition = asyncHandler(async (req, res, next) => {
  try {
    const id = req.query.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError("Invalid ID", 400);
    }

    await deleteTraditionByAdmin(id);

    res.status(200).json({
      success: true,
      message: "Tradition deleted successfully",
      data: null,
    });
  } catch (err) {
    next(err);
  }
});

// 🔧 FILTER BUILDER
async function buildTraditionFilters({
  type,
  paksha,
  tithi,
  month,
  createdFrom,
  createdTo,
  createdBy,
  search,
}) {
  const filters = {};

  if (type !== undefined) filters.type = Number(type);
  if (paksha) filters.paksha = { $regex: paksha, $options: "i" };
  if (tithi) filters.tithi = { $regex: tithi, $options: "i" };
  if (month) filters.month = { $regex: month, $options: "i" };

  if (createdFrom || createdTo) {
    filters.createdAt = {};
    if (createdFrom) filters.createdAt.$gte = new Date(createdFrom);
    if (createdTo) filters.createdAt.$lte = new Date(createdTo);
  }

  if (createdBy && mongoose.Types.ObjectId.isValid(createdBy)) {
    filters.created_by = new mongoose.Types.ObjectId(createdBy);
  }

  if (search) {
    filters.$or = [
      { name: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  return filters;
}
