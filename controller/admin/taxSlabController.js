const asyncHandler = require("../../middlewares/asyncHandler");
const taxSlabService = require("../../services/admin/taxSlabService")

exports.getAllTaxSlab = asyncHandler(async (req, res) => {
  const slabs = await taxSlabService.getAll();
  res.status(200).json({ success: true, data: slabs });
});

exports.getTaxSlab = asyncHandler(async (req, res) => {
  const { id } = req.query;
  const slab = await taxSlabService.getById(id);
  res.status(200).json({ success: true, data: slab });
});

exports.createTaxSlab = asyncHandler(async (req, res) => {
  const slab = await taxSlabService.create(req.body, req.user._id);
  res.status(201).json({ success: true, data: slab });
});

exports.updateTaxSlab = asyncHandler(async (req, res) => {
  const { id } = req.query;
  const slab = await taxSlabService.update(id, req.body);
  res.status(200).json({ success: true, data: slab });
});

exports.deleteTaxSlab = asyncHandler(async (req, res) => {
  const { id } = req.query;
  await taxSlabService.remove(id);
  res.status(200).json({ success: true, message: "Tax slab deleted" });
});
