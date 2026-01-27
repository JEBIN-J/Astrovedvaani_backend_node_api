const asyncHandler = require("../../middlewares/asyncHandler");
const LanguageService = require("../../services/admin/AstrologerSkillsService");
const Enums = require("../../utils/constants");
const CacheService = require("../../utils/redis/cacheService");

exports.getLanguages = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search } = req.query;
  let { isActive } = req.query;
  const role = req.user.role;
  if (role === Enums.USER.ROLE.USER) {
    isActive = true;
  }
  const result = await LanguageService.getAllLanguages({ 
    page: Number(page), 
    limit: Number(limit), 
    isActive: isActive !== undefined ? isActive === "true" || isActive === true : undefined,
    search: search || undefined,
  });

  res.status(200).json({
    success: true,
    message: "Languages fetched successfully",
    data: result.data,
    pagination: result.pagination,
  });
});


exports.addLanguage = asyncHandler(async (req, res) => {
  const data = await LanguageService.createLanguage(req.body);
  res.status(201).json({ success: true, data });
});

exports.updateLanguage = asyncHandler(async (req, res) => {
  const data = await LanguageService.updateLanguage(req.query.id, req.body);
  res.status(200).json({ success: true, data });
});

exports.deleteLanguage = asyncHandler(async (req, res) => {
  await LanguageService.removeLanguage(req.query.id);
  res.status(200).json({ success: true, message: "Language deleted successfully" });
});

exports.getSpecializations = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search } = req.query;
  let { isActive } = req.query;

  const role = req.user.role;
  if (role === Enums.USER.ROLE.USER) {
    isActive = true;
  }

  const result = await LanguageService.getAllSpecializations({ 
    page: Number(page) || 1, 
    limit: Number(limit) || 50, 
    isActive: isActive !== undefined ? isActive === "true" || isActive === true : undefined,
    search: search || undefined,
  });

  res.status(200).json({
    success: true,
    message: "Specializations fetched successfully",
    data: result.data,
    pagination: result.pagination,
  });
});

exports.addSpecialization = asyncHandler(async (req, res) => {
  const data = await LanguageService.createSpecialization(req.body);
  res.status(201).json({ success: true, data });
});

exports.updateSpecialization = asyncHandler(async (req, res) => {
  const data = await LanguageService.updateSpecialization(req.query.id, req.body);
  res.status(200).json({ success: true, data });
});

exports.deleteSpecialization = asyncHandler(async (req, res) => {
  await LanguageService.removeSpecialization(req.query.id);
  res.status(200).json({ success: true, message: "Specialization deleted successfully" });
});


const CACHE_KEY = CacheService.CACHE_PREFIXES.USERS_LIST + ":skills:user-view";

exports.getSkills = asyncHandler(async (req, res) => {
  const { isLanguage, isSpecialization } = req.query;
  let { isActive } = req.query;
  const role = req.user?.role || Enums.USER.ROLE.ASTROLOGER;
  if (role === Enums.USER.ROLE.USER || role === Enums.USER.ROLE.ASTROLOGER) {
    isActive = true;
  }

  // Try cache first
  const cached = await CacheService.get(CACHE_KEY);
  if (cached) return res.status(200).json({ success: true, data: cached });

  const options = { limit: 1000, isActive: isActive !== undefined ? isActive === "true" || isActive === true : undefined };
  const data = {};

  if ((isLanguage === undefined && isSpecialization === undefined) || isLanguage === "true" || isLanguage === true) {
    const languages = await LanguageService.getAllLanguages(options);
    data.languages = languages.data
      ? languages.data.map(({ _id, name }) => ({ _id, name }))
      : languages.map(({ _id, name }) => ({ _id, name }));
  }

  if ((isLanguage === undefined && isSpecialization === undefined) || isSpecialization === "true" || isSpecialization === true) {
    const specializations = await LanguageService.getAllSpecializations(options);
    data.specializations = specializations.data
      ? specializations.data.map(({ _id, name }) => ({ _id, name }))
      : specializations.map(({ _id, name }) => ({ _id, name }));
  }

  // Cache the simplified response
  await CacheService.set(CACHE_KEY, data, 60 * 5); // 5 min TTL

  res.status(200).json({ success: true, data });
});