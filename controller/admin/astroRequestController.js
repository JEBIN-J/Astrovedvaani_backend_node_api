const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const Service = require("../../services/admin/astrologerRateRequestService");

const getAllRequests = asyncHandler(async (req, res) => {

  let { status, serviceType, page = 1, limit = 10, search } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);

  const result = await Service.getAllRequests({
    status: status != null ? Number(status) : undefined,
    serviceType: serviceType != null ? Number(serviceType) : undefined,
    search: search || undefined,
    page,
    limit
  });

  return res.status(200).json({
    success: true,
    message: "Requests fetched successfully",
    data: result.data,
    pagination: result.pagination
  });
});

const updateRequest = asyncHandler(async (req, res) => {

  const { requestId } = req.params;
  const { status, reason } = req.body;

  if (status == null) {
    throw new BadRequestError("status is required");
  }

  const data = await Service.updateRequest({
    requestId,
    status: Number(status),
    adminId: req.user._id,
    reason
  });

  return res.status(200).json({
    success: true,
    message: "Request processed successfully",
    data
  });
});

const deleteRequest = asyncHandler(async (req, res) => {

  const { requestId } = req.params;

  await Service.deleteRequest({ requestId });

  return res.status(200).json({
    success: true,
    message: "Request deleted successfully"
  });
});

module.exports = {
  getAllRequests,
  updateRequest,
  deleteRequest
};