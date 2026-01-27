const poojaBookingService = require('../../services/astrologer/poojaBookingService');
const { buildPaginationResponse } = require('../../utils/pagination');

exports.getPoojaBookings = async (req, res, next) => {
  try {
    const astrologerUserId = req.user._id; // from token
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await poojaBookingService.getPoojaBookingsForAstrologer(astrologerUserId, page, limit);

    res.status(200).json({
      success: true,
      bookings: result.bookings,
      pagination: buildPaginationResponse({
        totalDocs: result.total,
        totalPages: Math.ceil(result.total / limit),
        page,
        limit,
      }),
    });
  } catch (error) {
    console.error('Error fetching Pooja bookings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error',
    });
  }
};
