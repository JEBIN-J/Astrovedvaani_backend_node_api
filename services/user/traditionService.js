const ApiError = require("../../errors/apiError");
const Tradition = require("../../models/Tradition");
const mongoose = require("mongoose");

const getTraditionsForUsers = async ({ month, type }) => {
  try {
    let filterData = {};

    if (type) {
      filterData.type = type;
    }

    if (month && month.length > 0) {
      filterData.month = month;
    }

    const traditions = await Tradition.find(filterData).lean();
    return traditions;
  } catch (error) {
    throw new ApiError(`Error getting traditions: ${error.message}`, 500);
  }
};

const getTraditionBySlugOrId = async (idOrSlug) => {
  try {
    let tradition;

    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      tradition = await Tradition.findById(idOrSlug).lean();
    }

    if (!tradition) {
      tradition = await Tradition.findOne({ slug: idOrSlug }).lean();
    }

    return tradition;
  } catch (error) {
    throw new ApiError(`Error getting tradition: ${error.message}`, 500);
  }
};

module.exports = {
  getTraditionsForUsers,
  getTraditionBySlugOrId,
};
