const MediaContent = require("../../models/Media");
const { ValidationError } = require("../../errors");
const CacheService = require("../../utils/redis/cacheService");

exports.createMedia = async (data) => {
  return await MediaContent.create(data);
};

exports.updateMedia = async (id, data) => {
  return await MediaContent.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};

exports.fetchMedia = async ({ page = 1, limit = 10, filter = {} }) => {
  const skip = (page - 1) * limit;

  const cacheKey = CacheService.generateKey(
    "media:list",
    page,
    limit,
    JSON.stringify(filter),
  );

  const cached = await CacheService.get(cacheKey);
  if (cached) {
    return cached;
  }

  const [mediaList, total] = await Promise.all([
    MediaContent.find(filter)
      .select(
        "_id name type description short_description thumbnail createdBy url slug createdAt",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MediaContent.countDocuments(filter),
  ]);

  const result = { mediaList, total };

  await CacheService.set(cacheKey, result, 60 * 5);

  return result;
};

exports.getMediaById = async (id, slug) => {
  let query = {};

  if (id) {
    query._id = id;
  } else if (slug) {
    query.slug = slug;
  } else {
    throw new ValidationError("Media ID or slug is required");
  }

  return await MediaContent.findOne(query).populate("createdBy", "name email"); // jaise blog me author populate kiya hai
};

exports.deleteMedia = async (id) => {
  return await MediaContent.findByIdAndDelete(id);
};
