const Model = require("../../models/AstrologyServiceDetails");

exports.createAstrologyService = async (data) => {
  return await Model.create(data);
};

exports.updateAstrologyService = async (id, data) => {
  return await Model.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};

exports.getAllAstrologyServices = async ({
  page = 1,
  limit = 10,
  filter = {},
  sort = {},
}) => {
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    Model.find(filter)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Model.countDocuments(filter),
  ]);

  return { docs, total };
};

exports.getAstrologyService = async (id, slug) => {
  let query = {};

  if (id) query._id = id;
  else if (slug) query.slug = slug;
  else throw new Error("ID or slug required");

  return await Model.findOne(query)
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email");
};

exports.deleteAstrologyService = async (id) => {
  return await Model.findByIdAndDelete(id);
};
