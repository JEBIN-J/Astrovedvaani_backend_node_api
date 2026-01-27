const asyncHandler = require("../../middlewares/asyncHandler");
const { BadRequestError } = require("../../errors");
const {
  createCarouselBannerService,
  getCarouselBannersService,
  updateCarouselBannerService,
  deleteCarouselBannerService,
  setStaticPageService,
  getStaticPagesService,
  getAllTestimonials,
  getAllFAQs,
} = require("../../services/admin/contentService");
const { buildPaginationResponse } = require("../../utils/pagination");

exports.createBanner = asyncHandler(async (req, res) => {
  const result = await createCarouselBannerService(req.body, req.user);
  return res.status(201).json({ success: true, data: result });
});
exports.getBanners = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const filters = req.query;

  const { banners, totalDocs } = await getCarouselBannersService(
    filters,
    page,
    limit,
  );

  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  });

  return res.status(200).json({
    success: true,
    data: banners,
    pagination,
  });
});

exports.updateBanner = asyncHandler(async (req, res) => {
  const result = await updateCarouselBannerService(req.query.id, req.body);
  return res.status(200).json({ success: true, data: result });
});

exports.deleteBanner = asyncHandler(async (req, res) => {
  const { id } = req.query;
  if (!id) throw new BadRequestError("Banner ID is required");

  const result = await deleteCarouselBannerService(id);
  return res.status(200).json({ success: true, data: result });
});

exports.setStaticPage = asyncHandler(async (req, res) => {
  const result = await setStaticPageService(req.body, req.user);
  return res.status(200).json({ success: true, data: result });
});

exports.getStaticPage = asyncHandler(async (req, res) => {
  const query = { ...req.query };
  if (query.type) query.type = Number(query.type);
  if (query.contentType) query.contentType = Number(query.contentType);
  const result = await getStaticPagesService(query);
  return res.status(200).json({ success: true, data: result });
});

exports.getAllTestimonials = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const { testimonials, totalDocs } = await getAllTestimonials(
    page,
    limit,
    search,
  );

  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  });

  res.status(200).json({
    success: true,
    data: testimonials,
    pagination,
  });
});

exports.getAllFAQs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const { faqs, totalDocs } = await getAllFAQs(page, limit, search);

  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  });

  res.status(200).json({
    success: true,
    data: faqs,
    pagination,
  });
});
