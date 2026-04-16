const PoojaMaster = require("../../../models/Pooja");
const PoojaBooking = require("../../../models/PoojaBooking");
const Address = require("../../../models/Address");
const Astrologer = require("../../../models/Astrologer");
const WalletLedger = require("../../../models/Ledger");
const mongoose = require("mongoose");
const slugify = require("slugify");
const logger = require("../../../utils/logger");
const {
  emitAstrologerAssigned,
  emitBookingStatusUpdate,
} = require("../../socket/poojaSocket");
const { getAstrologerDetails } = require("../../session/astrologerService");
const Enums = require("../../../utils/constants");
const { getFeedBackBySourceId } = require("../feedBackService");
const AstrologerServiceRates = require("../../../models/AstrologerServiceRates");
const {
  notifyAstrologerRemoved,
  notifyAstrologerAssigned,
  notifyUserPoojaAssigned,
  notifyAstrologerPoojaConfirmed,
} = require("../../notification/notifyService");
const { getAdminUserId } = require("../../session/userService");
const Wallet = require("../../../models/Wallet");
const Order = require("../../../models/Order");

function normalizePoojaPricing({ selling_price, discount }) {
  selling_price = Number(selling_price || 0);
  discount = Number(discount || 0);
  if (selling_price <= 0) {
    throw new Error("selling_price must be > 0");
  }
  if (discount < 0 || discount > 100) {
    throw new Error("discount must be between 0 and 100");
  }
  const base_price =
    discount > 0
      ? Number((selling_price * (1 + discount / 100)).toFixed(2))
      : 0;
  return {
    selling_price,
    base_price,
    discount,
    final_price: selling_price,
  };
}
exports.createPooja = async (data) => {
  const { selling_price, discount, slug, ...poojaData } = data;

  poojaData.slug =
    slug || slugify(poojaData.name, { lower: true, strict: true });

  const pricing = normalizePoojaPricing({
    selling_price,
    discount,
  });

  Object.assign(poojaData, pricing);

  const pooja = new PoojaMaster(poojaData);
  return await pooja.save();
};
exports.updatePooja = async (id, data) => {
  const { selling_price, discount, slug, ...updateData } = data;

  const current = await PoojaMaster.findById(id);
  if (!current) throw new Error("Pooja not found");

  if ("image_url" in updateData) {
    const imageToCheck = updateData.image_url;

    if (!imageToCheck || String(imageToCheck).trim() === "") {
      throw new Error("Image is required to update pooja");
    }
  }
  if ("selling_price" in data) {
    const sp = Number(selling_price);

    if (!sp || isNaN(sp) || sp <= 0) {
      throw new Error("Selling price must be greater than 0");
    }
  }

  if ("name" in updateData) {
    current.name = updateData.name;
    current.slug = slugify(updateData.name, {
      lower: true,
      strict: true,
    });
  }

  if ("description" in updateData) {
    current.description = updateData.description;
  }

  if ("image_url" in updateData) {
    current.image_url = updateData.image_url;
  }

  if ("is_active" in updateData) {
    current.is_active = updateData.is_active;
  }

  if ("gst_percent" in updateData) {
    current.gst_percent = Number(updateData.gst_percent || 0);
  }

  const effectiveSellingPrice =
    selling_price !== undefined ? Number(selling_price) : current.selling_price;

  const effectiveDiscount =
    discount !== undefined ? Number(discount) : current.discount;

  if (selling_price !== undefined || discount !== undefined) {
    const pricing = normalizePoojaPricing({
      selling_price: effectiveSellingPrice,
      discount: effectiveDiscount,
    });

    current.selling_price = pricing.selling_price;
    current.base_price = pricing.base_price;
    current.discount = pricing.discount;
    current.final_price = pricing.final_price;
  }

  return await current.save();
};

exports.getPoojaById = async (id) => {
  return await PoojaMaster.findById(id);
};

exports.deletePooja = async (id) => {
  return await PoojaMaster.findByIdAndDelete(id);
};

exports.togglePoojaStatus = async (id) => {
  console.log(`toggle-id ${id}`);
  const pooja = await PoojaMaster.findById(id);
  if (!pooja) return null;

  pooja.is_active = !pooja.is_active;
  return await pooja.save();
};

exports.getPoojas = async ({ page = 1, limit = 10, search = "" }) => {
  const skip = (page - 1) * limit;

  const query = search ? { name: { $regex: search, $options: "i" } } : {};

  const [poojas, totalDocs] = await Promise.all([
    PoojaMaster.find(query)
      .select(
        "name slug description image_url base_price gst_percent discount final_price selling_price is_active createdAt",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PoojaMaster.countDocuments(query),
  ]);

  return {
    poojas,
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  };
};

exports.getAllBookings = async ({
  page = 1,
  limit = 10,
  search = "",
  booking_status,
  payment_status,
  is_astrologer_assigned,
  user_id,
  astrologer_id,
}) => {
  const skip = (page - 1) * limit;
  const match = {};
  if (booking_status) match.booking_status = parseInt(booking_status);
  if (payment_status) match.payment_status = parseInt(payment_status);
  if (is_astrologer_assigned === "true") {
    match.astrologer_id = { $ne: null };
  } else if (is_astrologer_assigned === "false") {
    match.astrologer_id = null;
  }
  if (user_id) match.user_id = user_id;
  if (astrologer_id) match.astrologer_id = astrologer_id;
  if (search) {
    match.$or = [
      { special_notes: { $regex: search, $options: "i" } },
      { admin_remarks: { $regex: search, $options: "i" } },
    ];
  }
  logger.info("[getAllBookings] Fetching bookings with match:", match);
  const [bookings, totalDocs] = await Promise.all([
    PoojaBooking.find(match)
      .populate({
        path: "user_id",
        select: "name email profilePicture birthDate birthTime birthPlace",
      })
      .populate({
        path: "pooja_id",
        select: "name slug image_url",
      })
      .populate({
        path: "astrologer_id",
        select:
          "display_name bio specializations languages_spoken experience_years is_online is_busy is_premium verification_status user_id",
        populate: [
          { path: "specializations", select: "name" },
          { path: "languages_spoken", select: "name" },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PoojaBooking.countDocuments(match),
  ]);
  const userIds = bookings.map((b) => b.user_id?._id).filter(Boolean);
  const addresses = await Address.find({
    user_id: { $in: userIds },
    is_default: true,
    is_active: true,
  }).lean();
  const addressMap = {};
  for (const addr of addresses) {
    addressMap[addr.user_id.toString()] = {
      name: addr.name,
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      country: addr.country,
    };
  }
  const enrichedBookings = await Promise.all(
    bookings.map(async (booking, index) => {
      const user = booking.user_id;
      const userIdStr = user?._id?.toString();
      const astrologerUserId = booking.astrologer_id?.user_id;
      const finalPrice =
        booking.price_snapshot?.final_price || booking.total_amount || 0;
      logger.info(`[Booking ${index}] Booking ID: ${booking._id}`);
      logger.info(`[Booking ${index}] Final Price: ${finalPrice}`);
      logger.info(`[Booking ${index}] Astrologer User ID: ${astrologerUserId}`);
      let expected_user_debit = null;
      let expected_astrologer_credit = null;
      let expected_admin_earning = null;
      let actual_user_debit = null;
      let actual_astrologer_credit = null;
      let actual_admin_earning = null;
      if (finalPrice > 0 && astrologerUserId) {
        try {
          const { serviceRate } = await getAstrologerDetails(astrologerUserId, {
            service_type: Enums.SERVICE.TYPE.POOJA,
          });

          logger.info(
            `[Booking ${index}] Fetched serviceRate: ${JSON.stringify(
              serviceRate,
            )}`,
          );

          const commissionPercent = serviceRate?.commission_pct ?? 0;
          logger.info(
            `[Booking ${index}] Commission Percent: ${commissionPercent}`,
          );

          expected_astrologer_credit = Math.round(
            (commissionPercent / 100) * finalPrice,
          );
          expected_admin_earning = finalPrice - expected_astrologer_credit;
          expected_user_debit = finalPrice;

          const ledgerEntries = await WalletLedger.find({
            related_entity: booking._id,
            transaction_type: Enums.TRANSACTION.TYPE.POOJA,
          }).lean();

          logger.info(
            `[Booking ${index}] Found ${ledgerEntries.length} ledger entries`,
          );

          for (const entry of ledgerEntries) {
            if (entry.direction === Enums.TRANSACTION.DIRECTION.DEBIT) {
              actual_user_debit = (actual_user_debit || 0) + entry.amount;
            } else if (entry.direction === Enums.TRANSACTION.DIRECTION.CREDIT) {
              if (entry.remarks?.includes("Astrologer share")) {
                actual_astrologer_credit =
                  (actual_astrologer_credit || 0) + entry.amount;
              } else if (entry.remarks?.includes("Admin share")) {
                actual_admin_earning =
                  (actual_admin_earning || 0) + entry.amount;
              }
            }
          }
        } catch (error) {
          logger.error(
            `[Booking ${index}] Error fetching service rate or processing ledger:`,
            error,
          );
        }
      } else {
        logger.info(
          `[Booking ${index}] Skipping commission calc: price = ${finalPrice}, astrologerUserId = ${astrologerUserId}`,
        );
      }
      const feedback = await getFeedBackBySourceId(booking._id);
      return {
        ...booking,
        payment_method: booking.payment_method || null,
        user: user
          ? {
              _id: user._id,
              name: user.name,
              email: user.email,
              profilePicture: user.profilePicture,
              birthDate: user.birthDate,
              birthTime: user.birthTime,
              birthPlace: user.birthPlace,
              address: addressMap[userIdStr] || null,
            }
          : null,
        pooja: booking.pooja_id || null,
        astrologer: booking.astrologer_id
          ? {
              _id: booking.astrologer_id._id,
              display_name: booking.astrologer_id.display_name,
              bio: booking.astrologer_id.bio,
              specializations:
                booking.astrologer_id.specializations?.map((s) => s.name) || [],
              languages_spoken:
                booking.astrologer_id.languages_spoken?.map((l) => l.name) ||
                [],
              experience_years: booking.astrologer_id.experience_years,
              is_online: booking.astrologer_id.is_online,
              is_busy: booking.astrologer_id.is_busy,
              is_premium: booking.astrologer_id.is_premium,
              verification_status: booking.astrologer_id.verification_status,
            }
          : null,
        expected_user_debit,
        expected_astrologer_credit,
        expected_admin_earning,
        actual_user_debit,
        actual_astrologer_credit,
        actual_admin_earning,
        user_id: undefined,
        pooja_id: undefined,
        astrologer_id: undefined,
        rating: feedback?.rating ?? null,
        review: feedback?.review ?? null,
      };
    }),
  );

  return {
    bookings: enrichedBookings,
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  };
};

exports.assignAstrologer = async ({ booking_id, astrologer_user_id }) => {
  if (!booking_id) {
    throw new BadRequestError("booking_id is required");
  }
  if (!astrologer_user_id) {
    throw new BadRequestError("astrologer_user_id is required");
  }
  if (!mongoose.Types.ObjectId.isValid(booking_id)) {
    throw new BadRequestError("Invalid booking_id format");
  }
  if (!mongoose.Types.ObjectId.isValid(astrologer_user_id)) {
    throw new BadRequestError("Invalid astrologer_user_id format");
  }

  const booking = await PoojaBooking.findById(booking_id);
  if (!booking) {
    throw new NotFoundError("Booking not found");
  }

  if (booking.booking_status !== Enums.ORDER.STATUS.PENDING) {
    throw new ConflictError(
      "Astrologer can only be assigned when booking is in PENDING status",
    );
  }

  const astrologer = await Astrologer.findOne({ user_id: astrologer_user_id });
  if (!astrologer) {
    throw new NotFoundError("Astrologer not found");
  }

  const serviceRate = await AstrologerServiceRates.findOne({
    astrologer_id: astrologer._id,
    service_type: Enums.SERVICE.TYPE.POOJA,
  });
  if (!serviceRate) {
    throw new ConflictError("Astrologer service rate not configured for POOJA");
  }

  const commissionPct = serviceRate.commission_pct;

  booking.astrologer_id = astrologer._id;
  booking.commission_pct = commissionPct;

  booking.astrologer_share_amount = Number(
    (
      ((booking.price_snapshot?.final_price || 0) * commissionPct) /
      100
    ).toFixed(2),
  );

  await booking.save();
  return booking;
};

exports.updateBookingStatus = async ({
  booking_id,
  booking_status,
  admin_remarks,
  scheduled_at,
  admin_user_id = null,
}) => {
  logger.info("[updateBookingStatus] Start", {
    booking_id,
    booking_status,
    admin_remarks,
    scheduled_at,
  });

  if (!mongoose.Types.ObjectId.isValid(booking_id)) {
    throw new Error("Invalid booking ID.");
  }

  const booking = await PoojaBooking.findById(booking_id)
    .populate("astrologer_id")
    .populate("user_id");

  if (!booking) throw new Error("Booking not found.");
  if (booking.booking_status !== Enums.ORDER.STATUS.PENDING) {
    logger.warn(
      "[updateBookingStatus] Cannot update booking; not in PENDING state",
      {
        booking_id: booking._id,
        current_status: booking.booking_status,
      },
    );
    throw new Error("Booking can only be updated while in PENDING status");
  }

  const update = {};
  if (booking_status !== undefined) update.booking_status = booking_status;
  if (admin_remarks !== undefined) update.admin_remarks = admin_remarks;
  if (scheduled_at !== undefined) {
    const date = new Date(scheduled_at);
    if (isNaN(date.getTime()))
      throw new Error("Invalid scheduled_at datetime.");
    update.scheduled_at = date;
  }

  Object.assign(booking, update);
  await booking.save();
  logger.info("[updateBookingStatus] Booking updated", {
    booking_id: booking._id,
    booking_status: booking.booking_status,
  });

  // --- Update related Order ---
  const order = await Order.findOne({
    order_type: Enums.ORDER.TYPE.POOJA,
    reference_id: booking._id,
  });

  if (order) {
    order.tracking_status = booking_status;
    await order.save();
    logger.info("[updateBookingStatus] Order updated", {
      order_id: order._id,
      tracking_status: order.tracking_status,
    });
  } else {
    logger.warn("[updateBookingStatus] No Order found for booking", {
      booking_id: booking._id,
    });
  }

  // --- Heavy stuff in background ---
  process.nextTick(async () => {
    try {
      logger.info("[updateBookingStatus-bg] Starting wallet/ledger flow", {
        booking_id,
        booking_status,
      });

      const adminUserId = admin_user_id || (await getAdminUserId());
      const adminWallet = await Wallet.findOne({ user_id: adminUserId });
      const bookingUserId = booking.user_id?._id || booking.user_id;
      const userWallet = await Wallet.findOne({ user_id: bookingUserId });
      const amount = booking.price_snapshot?.final_price ?? 0;
      const timestamp = new Date();

      // --- Cancelled (Refund User) ---
      if (booking_status === Enums.ORDER.STATUS.CANCELLED) {
        if (adminWallet && userWallet) {
          adminWallet.balance = Number(
            (adminWallet.balance - amount).toFixed(2),
          );
          userWallet.balance = Number((userWallet.balance + amount).toFixed(2));
          await Promise.all([adminWallet.save(), userWallet.save()]);
          await WalletLedger.create([
            {
              wallet_id: adminWallet._id,
              user_id: adminUserId,
              transaction_type: Enums.TRANSACTION.TYPE.POOJA_REFUND,
              direction: Enums.TRANSACTION.DIRECTION.DEBIT,
              amount,
              final_amount: adminWallet.balance,
              remarks: `Refund for cancelled booking ${booking._id}`,
              timestamp,
            },
            {
              wallet_id: userWallet._id,
              user_id: bookingUserId,
              transaction_type: Enums.TRANSACTION.TYPE.POOJA_REFUND,
              direction: Enums.TRANSACTION.DIRECTION.CREDIT,
              amount,
              final_amount: userWallet.balance,
              remarks: `Refund received for cancelled booking ${booking._id}`,
              timestamp,
            },
          ]);
          logger.info("[updateBookingStatus-bg] Refund processed", {
            booking_id: booking._id,
            amount,
          });
        }
      }

      // --- Completed (Commission to Astrologer) ---
      else if (booking_status === Enums.ORDER.STATUS.COMPLETED) {
        const astrologer = booking.astrologer_id;
        if (astrologer && astrologer.user_id) {
          const astroUserId = astrologer.user_id._id || astrologer.user_id;
          const astrologerWallet = await Wallet.findOne({
            user_id: astroUserId,
          });
          const commission = booking.astrologer_share_amount ?? 0;

          if (astrologerWallet && commission > 0) {
            adminWallet.balance = Number(
              (adminWallet.balance - commission).toFixed(2),
            );
            astrologerWallet.balance = Number(
              (astrologerWallet.balance + commission).toFixed(2),
            );
            await Promise.all([adminWallet.save(), astrologerWallet.save()]);
            await WalletLedger.create([
              {
                wallet_id: adminWallet._id,
                user_id: adminUserId,
                transaction_type: Enums.TRANSACTION.TYPE.POOJA_COMMISSION,
                direction: Enums.TRANSACTION.DIRECTION.DEBIT,
                amount: commission,
                final_amount: adminWallet.balance,
                remarks: `Commission payout for booking ${booking._id}`,
                timestamp,
              },
              {
                wallet_id: astrologerWallet._id,
                user_id: astroUserId,
                transaction_type: Enums.TRANSACTION.TYPE.POOJA_COMMISSION,
                direction: Enums.TRANSACTION.DIRECTION.CREDIT,
                amount: commission,
                final_amount: astrologerWallet.balance,
                remarks: `Commission received for booking ${booking._id}`,
                timestamp,
              },
            ]);
            logger.info("[updateBookingStatus-bg] Commission processed", {
              booking_id: booking._id,
              commission,
            });

            // Notify astrologer
            await notifyAstrologerPoojaConfirmed({
              astrologerUserId: astroUserId,
              poojaName: booking.pooja_name,
              scheduledAt: booking.scheduled_at,
              amount: commission,
            });
          }
        }
      }

      // --- Emit socket/push event ---
      await emitBookingStatusUpdate({
        bookingId: booking._id,
        userId: bookingUserId,
        astrologerUserId: booking.astrologer_id?.user_id,
        status: booking.booking_status,
        scheduledAt: booking.scheduled_at,
        adminUserId: admin_user_id,
      });
      logger.info("[updateBookingStatus-bg] Booking status event emitted", {
        bookingId: booking._id,
      });
    } catch (err) {
      logger.error("[updateBookingStatus-bg] Error in background flow", {
        booking_id,
        error: err,
      });
    }
  });

  return booking;
};
