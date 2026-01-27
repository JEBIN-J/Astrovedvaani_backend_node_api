const faqService = require('../../services/admin/faqService');
const asyncHandler = require('../../middlewares/asyncHandler');
const { buildPaginationResponse } = require('../../utils/pagination');

exports.addFAQ = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const faq = await faqService.addFAQ(req.body, adminId);
  res.status(201).json({ success: true, data: faq });
});

exports.getAllFAQs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const { faqs, totalDocs } = await faqService.getAllFAQs(page, limit, search);

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

exports.getFAQById = asyncHandler(async (req, res) => {
  const faq = await faqService.getFAQById(req.query.id);
  res.status(200).json({ success: true, data: faq });
});

exports.updateFAQ = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const faq = await faqService.updateFAQ(req.query.id, req.body, adminId);
  res.status(200).json({ success: true, data: faq });
});

exports.deleteFAQ = asyncHandler(async (req, res) => {
  await faqService.deleteFAQ(req.query.id);
  res.status(200).json({ success: true, message: 'FAQ deleted successfully' });
});