const Model = require("../../models/AstrologyServiceDetails");

exports.getAll = async ({ page = 1, limit = 10, filter = {}, sort = {} }) => {
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    Model.find(filter)
      .select("title slug excerpt thumbnailImage category createdAt")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Model.countDocuments(filter),
  ]);

  return { docs, total };
};

exports.getOne = async (categoryId) => {
  if (!categoryId) throw new Error("Category ID required");
    const query = { category: Number(categoryId) };
  return await Model.findOne(query).select(
    "title slug content excerpt thumbnailImage category createdAt"
  );
};
