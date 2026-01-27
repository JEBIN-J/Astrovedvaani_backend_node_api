const PoojaBooking = require('../../models/PoojaBooking');
const PoojaMaster = require('../../models/Pooja');
const ServiceRate = require('../../models/AstrologerServiceRates');
const Enums = require('../../utils/constants');
const { fetchAstrologerFromUser } = require('./astrologerService');


exports.getPoojaBookingsForAstrologer = async (astrologerUserId, page = 1, limit = 10) => {
  const astrologer = await fetchAstrologerFromUser(astrologerUserId);
  const astrologerId = astrologer._id;
  const skip = (page - 1) * limit;

  const rawBookings = await PoojaBooking.find({ astrologer_id: astrologerId })
    .populate({ path: 'user_id', select: 'name email phone' })
    .populate({ path: 'pooja_id', model: PoojaMaster })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await PoojaBooking.countDocuments({ astrologer_id: astrologerId });

  const serviceRate = await ServiceRate.findOne({
    astrologer_id: astrologerId,
    service_type: Enums.SERVICE.TYPE.POOJA,
  });

  const commissionPct = serviceRate?.commission_pct ?? 0;

  const bookings = rawBookings.map((booking) => {
    const price = booking.price_snapshot?.final_price || 0;
    const astrologerShare = Math.round((commissionPct / 100) * price);
    const adminShare = price - astrologerShare;

    return {
      _id: booking._id,
      user: booking.user_id,
      pooja: booking.pooja_id,
      special_notes: booking.special_notes,
      scheduled_at: booking.scheduled_at,
      booking_status: booking.booking_status,
      payment_status: booking.payment_status,
      price_snapshot: booking.price_snapshot,
      astrologer_share: astrologerShare,
      admin_share: adminShare,
      createdAt: booking.createdAt,
    };
  });

  return { bookings, total };
};
