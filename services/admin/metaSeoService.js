const MetaSeo = require("../../models/MetaSeo");

exports.createMeta = async (data) => {
  return await MetaSeo.create(data);
};

exports.updateMeta = async (id, data) => {
  return await MetaSeo.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};

exports.fetchMetaList = async ({ page = 1, limit = 10, filter = {} }) => {
  const skip = (page - 1) * limit;

  const safeFilter = { ...filter };
  delete safeFilter.is_active;

  const query = { ...safeFilter, is_active: true };

  const [list, totalDocs] = await Promise.all([
    MetaSeo.find(query)
      .select("-meta_keywords")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    MetaSeo.countDocuments(query),
  ]);

  return { list, totalDocs };
};

exports.getMetaById = async (id) => {
  return await MetaSeo.findById(id).lean();
};

exports.toggleMetaStatus = async (id) => {
  const meta = await MetaSeo.findById(id);
  if (!meta) {
    throw new Error("Meta not found");
  }

  meta.is_active = !meta.is_active;
  await meta.save();

  //  meta_keywords remove before return
  const metaObj = meta.toObject();
  delete metaObj.meta_keywords;

  return metaObj;
};
