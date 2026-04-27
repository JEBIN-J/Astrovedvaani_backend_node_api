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
  notifyAstrologerPoojaCancelled,
} = require("../../notification/notifyService");
const { getAdminUserId } = require("../../session/userService");
const Wallet = require("../../../models/Wallet");
const Order = require("../../../models/Order");
const { emitWalletUpdate } = require("../../socket/walletNotification");
const { BadRequestError } = require("../../../errors");

function normalizePoojaPricing({ selling_price, discount, gstRate }) {
  selling_price = Number(selling_price || 0);
  discount = Number(discount || 0);
  if (selling_price <= 0) {
    throw new Error("selling_price must be > 0");
  }
  if (discount < 0 || discount >= 100) {
    throw new Error("discount must be between 0 and 99");
  }
  const base_price =
    discount > 0
      ? Number((selling_price / (1 - discount / 100)).toFixed(2))
      : Number(selling_price.toFixed(2));

  const final_price = Number((selling_price * (1 + gstRate / 100)).toFixed(2));

  return {
    selling_price: Number(selling_price.toFixed(2)),
    base_price,
    discount,
    final_price,
  };
}

exports.createPooja = async (data) => {
  const { selling_price, discount, slug, ...poojaData } = data;

  poojaData.slug =
    slug || slugify(poojaData.name, { lower: true, strict: true });

  const pricing = normalizePoojaPricing({
    selling_price,
    discount,
    gstRate: poojaData?.gst_percent,
  });

  Object.assign(poojaData, pricing);

  const pooja = new PoojaMaster(poojaData);
  return await pooja.save();
};
exports.updatePooja = async (id, data) => {
  const { selling_price, discount, gst_percent, slug, ...updateData } = data;
  console.log("gst", gst_percent);
  const current = await PoojaMaster.findById(id);
  if (!current) throw new Error("Pooja not found");
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
  if (gst_percent !== undefined) {
    current.gst_percent = Number(gst_percent);
  }
  const effectiveSellingPrice =
    selling_price !== undefined ? Number(selling_price) : current.selling_price;
  const effectiveDiscount =
    discount !== undefined ? Number(discount) : current.discount;
  const effectiveGst =
    gst_percent !== undefined ? Number(gst_percent) : current.gst_percent;
  if (selling_price !== undefined || discount !== undefined) {
    const pricing = normalizePoojaPricing({
      selling_price: effectiveSellingPrice,
      discount: effectiveDiscount,
      gstRate: effectiveGst,
    });
    current.selling_price = pricing.selling_price;
    current.base_price = pricing.base_price;
    current.discount = pricing.discount;
    current.final_price = pricing.final_price;

    console.log("current", current);
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
        "name slug description image_url base_price selling_price gst_percent discount final_price is_active createdAt",
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
  booking_start_date,
  booking_end_date,
  pooja_start_date,
  pooja_end_date,
}) => {
  const skip = (page - 1) * limit;
  const match = {};

  // ✅ Filters
  if (booking_status) match.booking_status = parseInt(booking_status);
  if (payment_status) match.payment_status = parseInt(payment_status);

  if (user_id) match.user_id = new mongoose.Types.ObjectId(user_id);
  if (astrologer_id)
    match.astrologer_id = new mongoose.Types.ObjectId(astrologer_id);

  if (is_astrologer_assigned === "true") {
    match.astrologer_id = { $ne: null };
  } else if (is_astrologer_assigned === "false") {
    match.astrologer_id = null;
  }

  // ✅ Date filters
  if (booking_start_date || booking_end_date) {
    match.scheduled_at = {};
    if (booking_start_date) {
      const start = new Date(booking_start_date);
      start.setHours(0, 0, 0, 0);
      match.scheduled_at.$gte = start;
    }
    if (booking_end_date) {
      const end = new Date(booking_end_date);
      end.setHours(23, 59, 59, 999);
      match.scheduled_at.$lte = end;
    }
  }

  if (pooja_start_date || pooja_end_date) {
    match.createdAt = {};
    if (pooja_start_date) {
      const start = new Date(pooja_start_date);
      start.setHours(0, 0, 0, 0);
      match.createdAt.$gte = start;
    }
    if (pooja_end_date) {
      const end = new Date(pooja_end_date);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
  }

  const pipeline = [
    { $match: match },

    // ✅ USER
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },

    // ✅ POOJA
    {
      $lookup: {
        from: "poojamasters",
        localField: "pooja_id",
        foreignField: "_id",
        as: "pooja",
      },
    },
    { $unwind: "$pooja" },

    // ✅ ASTROLOGER
    {
      $lookup: {
        from: "astrologers",
        localField: "astrologer_id",
        foreignField: "_id",
        as: "astrologer",
      },
    },
    {
      $unwind: {
        path: "$astrologer",
        preserveNullAndEmptyArrays: true,
      },
    },

    // ✅ SPECIALIZATIONS
    {
      $lookup: {
        from: "specializations",
        localField: "astrologer.specializations",
        foreignField: "_id",
        as: "astrologer.specializations",
      },
    },

    // ✅ LANGUAGES SPOKEN (NEW 🔥)
    {
      $lookup: {
        from: "languages",
        localField: "astrologer.languages_spoken",
        foreignField: "_id",
        as: "astrologer.languages_spoken",
      },
    },

    // ✅ ASTROLOGER MOBILE NUMBER
    {
      $lookup: {
        from: "users",
        localField: "astrologer.user_id",
        foreignField: "_id",
        as: "astroUser",
      },
    },
    {
      $unwind: {
        path: "$astroUser",
        preserveNullAndEmptyArrays: true,
      },
    },

    // ✅ Merge mobile into astrologer
    {
      $addFields: {
        "astrologer.mobileNumber": "$astroUser.mobileNumber",
      },
    },

    // ❌ Remove extra
    {
      $project: {
        astroUser: 0,
      },
    },

    // ✅ SEARCH
    ...(search
      ? [
          {
            $match: {
              $or: [
                { "user.name": { $regex: search, $options: "i" } },
                { "pooja.name": { $regex: search, $options: "i" } },
                {
                  "astrologer.display_name": {
                    $regex: search,
                    $options: "i",
                  },
                },
              ],
            },
          },
        ]
      : []),

    // ✅ SORT
    { $sort: { createdAt: -1 } },

    // ✅ PAGINATION
    {
      $facet: {
        bookings: [{ $skip: skip }, { $limit: limit }],
        totalDocs: [{ $count: "count" }],
      },
    },
  ];

  const result = await PoojaBooking.aggregate(pipeline);

  const bookings = result[0]?.bookings || [];
  const totalDocs = result[0]?.totalDocs[0]?.count || 0;

  return {
    bookings,
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  };
};
exports.assignAstrologer = async ({
  booking_id,
  astrologer_user_id,
  admin_user_id = null,
}) => {
  logger.info("[assignAstrologer] Start", { booking_id, astrologer_user_id });
  if (!mongoose.Types.ObjectId.isValid(booking_id)) {
    throw new Error("Invalid booking ID.");
  }
  const astrologer = await Astrologer.findOne({ user_id: astrologer_user_id });
  if (!astrologer)
    throw new Error("Astrologer not found for provided user ID.");
  const booking = await PoojaBooking.findById(booking_id).populate(
    "pooja_id",
    "name",
  );
  if (!booking) throw new Error("Booking not found.");
  if (
    booking.booking_status === Enums.ORDER.STATUS.CANCELLED ||
    booking.booking_status === Enums.ORDER.STATUS.COMPLETED
  ) {
    const message = {
      [Enums.ORDER.STATUS.CANCELLED]: "Cancelled",
      [Enums.ORDER.STATUS.COMPLETED]: "Completed",
    };
    throw new BadRequestError(
      `Booking already ${message[booking.booking_status]}. astrologer can not be assigned.`,
    );
  }
  const previousAstrologerId = booking.astrologer_id;
  const serviceRate = await AstrologerServiceRates.findOne({
    astrologer_id: astrologer._id,
    service_type: Enums.SERVICE.TYPE.POOJA,
  });
  const commissionPct = serviceRate?.commission_pct || 0;
  const astroShareAmount = booking.price_snapshot?.final_price
    ? (booking.price_snapshot.final_price * commissionPct) / 100
    : 0;
  booking.astrologer_id = astrologer._id;
  booking.commission_pct = commissionPct;
  booking.astrologer_share_amount = astroShareAmount;
  booking.booking_status = Enums.ORDER.STATUS.PLACED;
  await booking.save();
  logger.info("[assignAstrologer] Astrologer assigned successfully", {
    booking_id,
    astrologer_id: astrologer._id,
  });

  const poojaName = booking.pooja_id?.name || "Pooja";
  process.nextTick(async () => {
    try {
      if (
        previousAstrologerId &&
        previousAstrologerId.toString() !== astrologer._id.toString()
      ) {
        const oldAstro =
          await Astrologer.findById(previousAstrologerId).populate("user_id");
        if (oldAstro?.user_id) {
          await notifyAstrologerRemoved({
            astrologerUserId: oldAstro.user_id,
            poojaName,
          });
        }
      }
      await notifyAstrologerAssigned({
        astrologerUserId: astrologer_user_id,
        poojaName,
        scheduledAt: booking.scheduled_at,
      });
      await notifyUserPoojaAssigned({
        userId: booking.user_id,
        astrologerName: astrologer.display_name,
        poojaName,
        scheduledAt: booking.scheduled_at,
      });
      logger.info("[assignAstrologer] Notifications sent in background");
    } catch (emitErr) {
      logger.error("[assignAstrologer] Background notification failed", {
        error: emitErr,
      });
    }
  });

  return booking;
};

function getStatusKey(object, value) {
  return Object.keys(object).find((key) => object[key] === value);
}

const updatePoojaStatus = {
  [Enums.ORDER.STATUS.PENDING]: [
    Enums.ORDER.STATUS.PLACED,
    Enums.ORDER.STATUS.CANCELLED,
  ],
  [Enums.ORDER.STATUS.PLACED]: [
    Enums.ORDER.STATUS.COMPLETED,
    Enums.ORDER.STATUS.CANCELLED,
  ],
  [Enums.ORDER.STATUS.CANCELLED]: [],
  [Enums.ORDER.STATUS.COMPLETED]: [],
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
  });

  if (!mongoose.Types.ObjectId.isValid(booking_id)) {
    throw new Error("Invalid booking ID.");
  }

  const booking = await PoojaBooking.findById(booking_id)
    .populate({
      path: "astrologer_id",
      populate: { path: "user_id" },
    })
    .populate("user_id")
    .populate("pooja_id", "name");

  if (!booking) throw new Error("Booking not found.");

  let currentStatus = booking.booking_status;

  // ================= STATUS TRANSITION VALIDATION =================
  if (booking_status !== undefined) {
    if (
      currentStatus === Enums.ORDER.STATUS.COMPLETED ||
      currentStatus === Enums.ORDER.STATUS.CANCELLED
    ) {
      currentStatus =
        getStatusKey(Enums.ORDER.STATUS, currentStatus) || currentStatus;
      throw new Error(
        `Booking already ${currentStatus}. Status cannot be changed.`,
      );
    }

    const allowedTransitions = updatePoojaStatus[currentStatus] || [];

    if (!allowedTransitions.includes(booking_status)) {
      currentStatus =
        getStatusKey(Enums.ORDER.STATUS, currentStatus) || currentStatus;
      let attemptedStatus =
        getStatusKey(Enums.ORDER.STATUS, booking_status) || booking_status;
      throw new Error(
        `Invalid status transition from ${currentStatus} to ${attemptedStatus}`,
      );
    }

    booking.booking_status = booking_status;
  }

  if (admin_remarks !== undefined) {
    booking.admin_remarks = admin_remarks;
  }

  if (scheduled_at !== undefined) {
    const date = new Date(scheduled_at);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid scheduled_at datetime.");
    }
    booking.scheduled_at = date;
  }

  // ===== STORE ASTROLOGER BEFORE CANCELLATION (important) =====
  const assignedAstrologer = booking.astrologer_id;

  // ================= CANCEL LOGIC =================
  if (booking_status === Enums.ORDER.STATUS.CANCELLED) {
    // If astrologer was assigned (PLACED case)
    if (currentStatus === Enums.ORDER.STATUS.PLACED && assignedAstrologer) {
      booking.astrologer_id = null;
      booking.commission_pct = 0;
      booking.astrologer_share_amount = 0;
    }
    booking.payment_status = Enums.PAYMENT.STATUS.REFUNDED;
  }

  await booking.save();

  // ================= UPDATE ORDER =================
  const order = await Order.findOne({
    order_type: Enums.ORDER.TYPE.POOJA,
    reference_id: booking._id,
  });

  if (order && booking_status !== undefined) {
    order.tracking_status = booking.booking_status;
    await order.save();
  }

  // ================= BACKGROUND OPERATIONS =================
  process.nextTick(async () => {
    try {
      const adminUserId = admin_user_id || (await getAdminUserId());
      const adminWallet = await Wallet.findOne({ user_id: adminUserId });
      if (!adminWallet) return;

      const bookingUserId = booking.user_id?._id || booking.user_id;
      const userWallet = await Wallet.findOne({ user_id: bookingUserId });

      const amount = booking.price_snapshot?.final_price ?? 0;
      const timestamp = new Date();

      // =========================================================
      // CANCELLED → REFUND USER
      // =========================================================
      if (booking_status === Enums.ORDER.STATUS.CANCELLED) {
        if (!userWallet || amount <= 0) return;

        const adminOpeningBalance = adminWallet.balance;
        const userOpeningBalance = userWallet.balance;

        adminWallet.balance = Number((adminWallet.balance - amount).toFixed(2));
        userWallet.balance = Number((userWallet.balance + amount).toFixed(2));

        await Promise.all([adminWallet.save(), userWallet.save()]);

        await WalletLedger.create([
          {
            wallet_id: adminWallet._id,
            user_id: adminUserId,
            transaction_type: Enums.TRANSACTION.TYPE.POOJA,
            direction: Enums.TRANSACTION.DIRECTION.DEBIT,
            opening_balance: adminOpeningBalance,
            payment_status: Enums.PAYMENT.STATUS.REFUNDED,
            amount,
            final_amount: amount,
            closing_balance: adminWallet.balance,
            remarks: `Refund for cancelled booking ${booking._id}`,
            timestamp,
          },
          {
            wallet_id: userWallet._id,
            user_id: bookingUserId,
            transaction_type: Enums.TRANSACTION.TYPE.POOJA,
            direction: Enums.TRANSACTION.DIRECTION.CREDIT,
            opening_balance: userOpeningBalance,
            payment_status: Enums.PAYMENT.STATUS.REFUNDED,
            amount,
            final_amount: amount,
            closing_balance: userWallet.balance,
            remarks: `Refund received for cancelled booking ${booking._id}`,
            timestamp,
          },
        ]);

        // ================= Notify astrologer if PLACED =================
        if (currentStatus === Enums.ORDER.STATUS.PLACED && assignedAstrologer) {
          const astro =
            await Astrologer.findById(assignedAstrologer).populate("user_id");

          if (astro?.user_id) {
            await notifyAstrologerPoojaCancelled({
              astrologerUserId: astro.user_id,
              poojaName: booking.pooja_id?.name || "Pooja",
              scheduledAt: booking.scheduled_at,
            });
          }
        }

        emitWalletUpdate(
          bookingUserId,
          amount,
          userOpeningBalance,
          userWallet.balance,
          "success",
          "booking",
        );
      }

      // =========================================================
      // COMPLETED → PAY ASTROLOGER
      // =========================================================
      else if (booking_status === Enums.ORDER.STATUS.COMPLETED) {
        const astrologer = booking.astrologer_id;
        if (!astrologer?.user_id) return;

        const astroUserId = astrologer.user_id._id || astrologer.user_id;
        const astrologerWallet = await Wallet.findOne({
          user_id: astroUserId,
        });

        if (!astrologerWallet) return;

        const commission = booking.astrologer_share_amount ?? 0;
        if (commission <= 0) return;

        const adminOpeningBalance = adminWallet.balance;
        const astroOpeningBalance = astrologerWallet.balance;

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
            transaction_type: Enums.TRANSACTION.TYPE.POOJA,
            direction: Enums.TRANSACTION.DIRECTION.DEBIT,
            opening_balance: adminOpeningBalance,
            amount: commission,
            final_amount: commission,
            closing_balance: adminWallet.balance,
            remarks: `Commission payout for booking ${booking._id}`,
            timestamp,
          },
          {
            wallet_id: astrologerWallet._id,
            user_id: astroUserId,
            transaction_type: Enums.TRANSACTION.TYPE.POOJA_COMMISSION,
            direction: Enums.TRANSACTION.DIRECTION.CREDIT,
            opening_balance: astroOpeningBalance,
            amount: commission,
            final_amount: commission,
            closing_balance: astrologerWallet.balance,
            remarks: `Commission received for booking ${booking._id}`,
            timestamp,
          },
        ]);
      }

      await emitBookingStatusUpdate({
        bookingId: booking._id,
        userId: bookingUserId,
        astrologerUserId: assignedAstrologer,
        status: booking.booking_status,
        scheduledAt: booking.scheduled_at,
        adminUserId,
      });
    } catch (err) {
      logger.error("[updateBookingStatus-bg] Error", err);
    }
  });

  return booking;
};
