const testimonialService = require('../../services/admin/testimonialService');
const asyncHandler = require('../../middlewares/asyncHandler');
const { buildPaginationResponse } = require('../../utils/pagination');

exports.addTestimonial = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const testimonial = await testimonialService.addTestimonial(req.body, adminId);
  res.status(201).json({ success: true, data: testimonial });
});

exports.getAllTestimonials = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const { testimonials, totalDocs } = await testimonialService.getAllTestimonials(page, limit, search);

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

exports.getTestimonialById = asyncHandler(async (req, res) => {
  const testimonial = await testimonialService.getTestimonialById(req.query.id);
  res.status(200).json({ success: true, data: testimonial });
});

exports.updateTestimonial = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const testimonial = await testimonialService.updateTestimonial(req.query.id, req.body, adminId);
  res.status(200).json({ success: true, data: testimonial });
});

exports.deleteTestimonial = asyncHandler(async (req, res) => {
  await testimonialService.deleteTestimonial(req.query.id);
  res.status(200).json({ success: true, message: 'Testimonial deleted successfully' });
});