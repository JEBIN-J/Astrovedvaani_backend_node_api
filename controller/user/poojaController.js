const asyncHandler = require("../../middlewares/asyncHandler");
const { buildPaginationResponse } = require("../../utils/pagination");
const poojaService = require("../../services/user/poojaService");

exports.getAllPoojas = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search = "" } = req.query;

  const paginationParams = {
    page: parseInt(page),
    limit: parseInt(limit),
    search,
  };

  const result = await poojaService.getPoojas(paginationParams);

  res.status(200).json({
    success: true,
    data: result.poojas,
    pagination: buildPaginationResponse(result),
  });
});
exports.getMyBookings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { status, name, page = 1, limit = 10 } = req.query;
  const result = await poojaService.getUserPoojaBookings(userId, {
    status,
    name,
    page: parseInt(page),
    limit: parseInt(limit),
  });

  res.status(200).json({
    success: true,
    data: result.bookings,
    pagination: buildPaginationResponse(result),
  });
});
exports.bookPooja = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const bookingData = {
    pooja_id: req.body.pooja_id,
    scheduled_date: req.body.scheduled_date, // DD/MM/YYYY
    scheduled_time: req.body.scheduled_time, // HH:mm
    special_notes: req.body.special_notes,
  };

  const booking = await poojaService.bookPooja(userId, bookingData);

  res.status(201).json({
    success: true,
    message: "Pooja booked successfully",
    data: booking,
  });
});
exports.updatePoojaBooking = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { booking_id, status, scheduled_date, scheduled_time } = req.body;

  const result = await poojaService.updatePoojaBooking(
    userId,
    booking_id,
    status,
    { scheduled_date, scheduled_time },
  );

  res.status(200).json({
    success: true,
    message: result.message,
    booking: result.booking || undefined,
  });
});
exports.getPoojaById = async (req, res) => {
  try {
    const { id, slug } = req.query;

    const pooja = await poojaService.getPoojaById(id, slug);

    return res.status(200).json({
      success: true,
      data: pooja,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};
