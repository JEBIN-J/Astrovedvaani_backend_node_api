const mongoose = require("mongoose");
const Tradition = require("../../models/Tradition");
const { ValidationError } = require("../../errors");
const logger = require("../../utils/logger");
const Enums = require("../../utils/constants");

// ✅ CREATE
const createTraditionByAdmin = async (data, userId) => {
  const { name, description, type, paksha, tithi, month, date, image_url } =
    data;

  if (!name) throw new ValidationError("Name is required", 400);

  const parsedDate = new Date(date);

  const tradition = new Tradition({
    name,
    description,
    type,
    paksha,
    tithi,
    month,
    date: parsedDate,
    image_url,
    created_by: userId,
    updated_by: userId,
  });

  await tradition.save();
  return { tradition };
};

// ✅ UPDATE
const updateTraditionByAdmin = async (id, data, userId) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError("Invalid ID", 400);
  }

  const updateData = {
    ...data,
    updated_by: userId,
  };

  if (data.date) {
    updateData.date = new Date(data.date);
  }

  if (data.name) {
    updateData.slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  const tradition = await Tradition.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!tradition) throw new ValidationError("Tradition not found", 404);

  return { tradition };
};

// ✅ DELETE
const deleteTraditionByAdmin = async (id) => {
  const tradition = await Tradition.findByIdAndDelete(id);
  if (!tradition) throw new ValidationError("Not found", 404);
  return { tradition };
};

// ✅ FETCH ALL
const fetchTraditionsWithDetails = async (filters, options) => {
  const { page, limit, sortBy, sortOrder } = options;

  const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

  const total = await Tradition.countDocuments(filters);

  const traditions = await Tradition.find(filters)
    .populate("created_by updated_by")
    .skip((page - 1) * limit)
    .limit(limit)
    .sort(sort);

  return {
    data: traditions,
    total,
  };
};

// ✅ FETCH BY ID / SLUG
const fetchTraditionByIdOrSlug = async (idOrSlug) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(idOrSlug);

  const query = isObjectId ? { _id: idOrSlug } : { slug: idOrSlug };

  const tradition = await Tradition.findOne(query).populate(
    "created_by updated_by",
  );

  if (!tradition) throw new ValidationError("Tradition not found", 404);

  return tradition;
};

// ✅ TOGGLE STATUS
const toggleTraditionStatusByAdmin = async (id, userId) => {
  const tradition = await Tradition.findById(id);
  if (!tradition) throw new ValidationError("Not found", 404);

  tradition.is_active = !tradition.is_active;
  tradition.updated_by = userId;

  return await tradition.save();
};

module.exports = {
  createTraditionByAdmin,
  updateTraditionByAdmin,
  deleteTraditionByAdmin,
  fetchTraditionsWithDetails,
  fetchTraditionByIdOrSlug,
  toggleTraditionStatusByAdmin,
};
