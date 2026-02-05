const Language = require("../../models/Language");
const Specialization = require("../../models/Specialization");
const CacheService = require("../../utils/redis/cacheService");
const { NotFoundError, ConflictError } = require("../../errors");
const { buildPaginationResponse } = require("../../utils/pagination");

const LANGUAGE_CACHE = CacheService.CACHE_PREFIXES.USERS_LIST + ":languages";
const SPECIALIZATION_CACHE =
  CacheService.CACHE_PREFIXES.USERS_LIST + ":specializations";

async function getAllLanguages({
  page = 1,
  limit = 50,
  isActive,
  search,
} = {}) {
  const cacheKey =
    isActive === undefined
      ? LANGUAGE_CACHE
      : `${LANGUAGE_CACHE}:active_${isActive}`;
  let cached = await CacheService.get(cacheKey);

  let allLanguages;
  if (cached) {
    allLanguages = cached.data;
  } else {
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive;
    allLanguages = await Language.find(filter).sort({ name: 1 }).lean();
    await CacheService.set(cacheKey, { data: allLanguages });
  }

  // --- apply search filter in memory ---
  if (search) {
    const regex = new RegExp(search, "i");
    allLanguages = allLanguages.filter((l) => regex.test(l.name));
  }

  // paginate in memory
  const totalDocs = allLanguages.length;
  const start = (page - 1) * limit;
  const paginatedData = allLanguages.slice(start, start + Number(limit));

  return {
    data: paginatedData,
    pagination: buildPaginationResponse({ totalDocs, page, limit }),
  };
}

async function createLanguage(data) {
  // data.name = data.name.toUpperCase();
  const existing = await Language.findOne({ name: data.name });
  if (existing) throw new ConflictError("Language already exists");

  const language = await new Language(data).save();
  await CacheService.clearMatchingKeys(CacheService.CACHE_PREFIXES.USERS_LIST);
  return language;
}

async function updateLanguage(id, data) {
  const language = await Language.findById(id);
  if (!language) throw new NotFoundError("Language not found");

  language.name = data.name || language.name;
  if (data.isActive !== undefined) language.isActive = data.isActive;

  await language.save();
  await CacheService.clearMatchingKeys(CacheService.CACHE_PREFIXES.USERS_LIST);
  return language;
}

async function removeLanguage(id) {
  const language = await Language.findById(id);
  if (!language) throw new NotFoundError("Language not found");

  await language.deleteOne();
  await CacheService.clearMatchingKeys(CacheService.CACHE_PREFIXES.USERS_LIST);
  return true;
}

async function getAllSpecializations({
  page = 1,
  limit = 50,
  isActive,
  related_to,
  search,
} = {}) {
  const cacheKey =
    SPECIALIZATION_CACHE +
    (isActive !== undefined ? `:active_${isActive}` : "") +
    (related_to !== undefined ? `:related_${related_to}` : "");

  let cached = await CacheService.get(cacheKey);
  let allSpecializations;

  if (cached) {
    allSpecializations = cached.data;
  } else {
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive;
    if (related_to !== undefined) filter.related_to = related_to;

    allSpecializations = await Specialization.find(filter)
      .sort({ name: 1 })
      .lean();

    await CacheService.set(cacheKey, { data: allSpecializations });
  }

  if (search) {
    const regex = new RegExp(search, "i");
    allSpecializations = allSpecializations.filter((s) =>
      regex.test(s.name),
    );
  }

  const totalDocs = allSpecializations.length;
  const start = (page - 1) * limit;
  const paginatedData = allSpecializations.slice(start, start + Number(limit));

  return {
    data: paginatedData,
    pagination: buildPaginationResponse({ totalDocs, page, limit }),
  };
}

async function createSpecialization(data) {
  const existing = await Specialization.findOne({ name: data.name });
  if (existing) throw new ConflictError("Specialization already exists");

  const spec = await new Specialization(data).save();
  await CacheService.clearMatchingKeys(CacheService.CACHE_PREFIXES.USERS_LIST);
  return spec;
}

async function updateSpecialization(id, data) {
  const spec = await Specialization.findById(id);
  if (!spec) throw new NotFoundError("Specialization not found");

  spec.name = data.name || spec.name;
  spec.description = data.description ?? spec.description;
  if (data.related_to !== undefined) spec.related_to = data.related_to;
  if (data.isActive !== undefined) spec.isActive = data.isActive;

  await spec.save();
  await CacheService.clearMatchingKeys(CacheService.CACHE_PREFIXES.USERS_LIST);
  return spec;
}

async function removeSpecialization(id) {
  const spec = await Specialization.findById(id);
  if (!spec) throw new NotFoundError("Specialization not found");

  await spec.deleteOne();
  await CacheService.clearMatchingKeys(CacheService.CACHE_PREFIXES.USERS_LIST);
  return true;
}

module.exports = {
  getAllLanguages,
  createLanguage,
  updateLanguage,
  removeLanguage,
  getAllSpecializations,
  createSpecialization,
  updateSpecialization,
  removeSpecialization,
};
