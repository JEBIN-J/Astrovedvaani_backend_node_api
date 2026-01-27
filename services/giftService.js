const Gift = require("../models/Gift");
const { NotFoundError } = require("../errors");
const logger = require("../utils/logger");

const addGift = async (data, adminId) => {
  const gift = new Gift({ ...data, createdBy: adminId });
  const savedGift = await gift.save();
  logger.info(`Gift created in DB: ${savedGift._id} by admin: ${adminId}`);
  return savedGift;
};

const getAllGifts = async (page = 1, limit = 10, search = "") => {
  const skip = (page - 1) * limit;

  const filter = {};
  if (search) {
    filter.name = { $regex: search, $options: "i" }; // case-insensitive search
  }

  const totalDocs = await Gift.countDocuments(filter);

  const gifts = await Gift.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  logger.info(
    `Fetched gifts from DB. Page: ${page}, Count: ${gifts.length}, Total: ${totalDocs}, Search: "${search}"`
  );

  return { gifts, totalDocs };
};
const getGiftById = async (id) => {
  const gift = await Gift.findById(id);
  if (!gift) {
    logger.info(`Gift not found in DB: ${id}`);
    throw new NotFoundError("Gift not found");
  }
  logger.info(`Fetched gift from DB: ${gift._id}`);
  return gift;
};

const updateGift = async (id, data, adminId) => {
  const gift = await Gift.findByIdAndUpdate(
    id,
    { ...data, updatedBy: adminId },
    { new: true, runValidators: true },
  );
  if (!gift) {
    logger.info(`Gift not found for update: ${id}`);
    throw new NotFoundError("Gift not found");
  }
  logger.info(`Gift updated in DB: ${gift._id} by admin: ${adminId}`);
  return gift;
};

const deleteGift = async (id) => {
  const gift = await Gift.findByIdAndDelete(id);
  if (!gift) {
    logger.info(`Gift not found for deletion: ${id}`);
    throw new NotFoundError("Gift not found");
  }
  logger.info(`Gift deleted from DB: ${gift._id}`);
  return gift;
};

module.exports = {
  addGift,
  getAllGifts,
  getGiftById,
  updateGift,
  deleteGift,
};
