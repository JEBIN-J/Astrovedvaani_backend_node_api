const poojaService = require("../../../services/admin/pooja/poojaMasterService");
const { buildPaginationResponse } = require("../../../utils/pagination");

// Create or Update (Upsert) Pooja
exports.upsertPooja = async (req, res, next) => {
  try {
    const id = req.body._id || req.query.id;
    const pooja = id
      ? await poojaService.updatePooja(id, req.body)
      : await poojaService.createPooja(req.body);

    res.status(id ? 200 : 201).json({
      success: true,
      message: id ? "Pooja updated successfully" : "Pooja created successfully",
      data: pooja,
    });
  } catch (err) {
    next(err);
  }
};

// Get Pooja by ID
exports.getPoojaById = async (req, res, next) => {
  try {
    const pooja = await poojaService.getPoojaById(req.params.id);
    if (!pooja) {
      return res
        .status(404)
        .json({ success: false, message: "Pooja not found" });
    }
    res.status(200).json({ success: true, data: pooja });
  } catch (err) {
    next(err);
  }
};

// Delete Pooja
exports.deletePooja = async (req, res, next) => {
  try {
    const id = req.query.id;
    const pooja = await poojaService.deletePooja(id);
    if (!pooja) {
      return res
        .status(404)
        .json({ success: false, message: "Pooja not found" });
    }
    res
      .status(200)
      .json({ success: true, message: "Pooja deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// Toggle is_active status
exports.togglePoojaStatus = async (req, res, next) => {
  try {
    const id = req.query.id;
    const pooja = await poojaService.togglePoojaStatus(id);
    if (!pooja) {
      return res
        .status(404)
        .json({ success: false, message: "Pooja not found" });
    }
    res
      .status(200)
      .json({ success: true, message: "Pooja status toggled", data: pooja });
  } catch (err) {
    next(err);
  }
};

exports.getAllPoojas = async (req, res, next) => {
  try {
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
  } catch (err) {
    next(err);
  }
};

exports.getAllBookingForPooja = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      booking_status,
      payment_status,
      is_astrologer_assigned,
      user_id,
      astrologer_id,

      // ✅ NEW FILTERS
      booking_start_date,
      booking_end_date,
      pooja_start_date,
      pooja_end_date,
    } = req.query;

    const filters = {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      booking_status,
      payment_status,
      is_astrologer_assigned,
      user_id,
      astrologer_id,

      // ✅ PASS NEW FILTERS
      booking_start_date,
      booking_end_date,
      pooja_start_date,
      pooja_end_date,
    };

    const result = await poojaService.getAllBookings(filters);

    res.status(200).json({
      success: true,
      data: result.bookings,

      // ✅ NEW COUNTS
      counts: {
        assigned_pooja: result.assignedCount,
        unassigned_pooja: result.unassignedCount,
      },

      pagination: buildPaginationResponse(result),
    });
  } catch (err) {
    next(err);
  }
};

exports.assignOrReassignAstrologer = async (req, res, next) => {
  try {
    const { astrologer_user_id, booking_id } = req.body;

    const updatedBooking = poojaService.assignAstrologer({
      booking_id,
      astrologer_user_id,
    });

    res.json({
      success: true,
      message: "Astrologer assigned successfully.",
      data: updatedBooking,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateBookingStatus = async (req, res, next) => {
  try {
    const { booking_status, admin_remarks, scheduled_at, booking_id } =
      req.body;

    const updatedBooking = await poojaService.updateBookingStatus({
      booking_id,
      booking_status,
      admin_remarks,
      scheduled_at,
    });

    res.json({
      success: true,
      message: "Booking updated successfully.",
      data: updatedBooking,
    });
  } catch (error) {
    next(error);
  }
};
