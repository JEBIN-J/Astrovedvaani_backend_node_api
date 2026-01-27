const {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ValidationError,
} = require("../../errors");
const Order = require("../../models/Order");
const PoojaMaster = require("../../models/Pooja");
const PoojaBooking = require("../../models/PoojaBooking");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const moment = require("moment");
const { getAdminUserId } = require("../session/userService");

const {
  emitPoojaBookingToAdmins,
  emitPoojaCancellationToAdmins,
} = require("../socket/poojaSocket");
const Wallet = require("../../models/Wallet");
const WalletLedger = require("../../models/Ledger");

exports.getPoojas = async ({ page = 1, limit = 10, search = "" }) => {
  try {
    const skip = (page - 1) * limit;
    const query = {
      is_active: true,
      ...(search && { name: { $regex: search, $options: "i" } }),
    };

    const [poojas, totalDocs] = await Promise.all([
      PoojaMaster.find(query)
        .select(
          "name slug description image_url base_price gst_percent discount final_price is_active createdAt",
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
  } catch (error) {
    logger.error("Error fetching poojas:", error);
    throw error;
  }
};
exports.getUserPoojaBookings = async (
  userId,
  { status, name, page = 1, limit = 10 },
) => {
  try {
    const skip = (page - 1) * limit;
    const query = { user_id: userId };
    if (status !== undefined && status !== "") {
      query.booking_status = parseInt(status);
    }
    const poojaMatch = {};
    if (name) {
      poojaMatch.name = { $regex: name, $options: "i" };
    }
    const [bookings, totalDocs] = await Promise.all([
      PoojaBooking.find(query)
        .populate({
          path: "pooja_id",
          match: poojaMatch,
          select: "name image_url final_price",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PoojaBooking.countDocuments(query),
    ]);
    const filteredBookings = bookings.filter((b) => b.pooja_id !== null);
    for (let booking of filteredBookings) {
      if (booking.payment_status === Enums.PAYMENT.STATUS.PENDING) {
        const order = await Order.findOne({
          reference_id: booking._id,
          order_type: Enums.ORDER.TYPE.POOJA,
          user_id: userId,
        })
          .select("_id")
          .lean();
        if (order) booking.order_id = order._id;
      }
      booking.scheduled_at_formatted = booking.scheduled_at
        ? moment(booking.scheduled_at)
            .tz("Asia/Kolkata")
            .format("DD/MM/YYYY HH:mm")
        : null;
    }
    return {
      bookings: filteredBookings,
      totalDocs: name ? filteredBookings.length : totalDocs,
      totalPages: Math.ceil(
        (name ? filteredBookings.length : totalDocs) / limit,
      ),
      page,
      limit,
    };
  } catch (error) {
    logger.error("Error fetching user pooja bookings:", error);
    throw error;
  }
};
exports.bookPooja = async (userId, data) => {
  try {
    const { pooja_id, scheduled_date, scheduled_time, special_notes } = data;
    const scheduledAt = moment(
      `${scheduled_date} ${scheduled_time}`,
      "DD/MM/YYYY HH:mm",
    ).toDate();
    const pooja = await PoojaMaster.findById(pooja_id).lean();
    if (!pooja) throw new NotFoundError("Pooja not found");
    if (!pooja.is_active)
      throw new BadRequestError("This pooja is currently inactive");
    if (scheduledAt < new Date())
      throw new BadRequestError("Cannot book pooja in the past");

    const existingBooking = await PoojaBooking.findOne({
      user_id: userId,
      pooja_id,
      payment_status: Enums.PAYMENT.STATUS.PENDING,
    });
    if (existingBooking)
      throw new ConflictError(
        "You already have a pending booking for this pooja",
      );

    // Wallet checks
    const userWallet = await Wallet.findOne({ user_id: userId });
    if (!userWallet || userWallet.balance < pooja.final_price) {
      throw new BadRequestError("Insufficient wallet balance");
    }
    const oldUserBalance = userWallet.balance;
    const adminUserId = await getAdminUserId();
    const adminWallet = await Wallet.findOne({ user_id: adminUserId });
    if (!adminWallet) throw new Error("Admin wallet not found");
    const userOpeningBalance = userWallet.balance;
    const adminOpeningBalance = adminWallet.balance;

    userWallet.balance = Number(
      (userWallet.balance - pooja.final_price).toFixed(2),
    );
    adminWallet.balance = Number(
      (adminWallet.balance + pooja.final_price).toFixed(2),
    );

    await Promise.all([userWallet.save(), adminWallet.save()]);

    // Emit wallet update notifications
    const walletNotification = require("../socket/walletNotification");
    walletNotification.emitWalletUpdate(
      userId,
      pooja.final_price,
      oldUserBalance,
      userWallet.balance,
      "success",
      "booking",
    );

    // Create ledger entries
    const timestamp = new Date();
    const remarks = `Pooja Booking: ${pooja.name}`;
    await WalletLedger.create([
      {
        wallet_id: userWallet._id,
        user_id: userId,
        transaction_type: Enums.TRANSACTION.TYPE.POOJA,
        direction: Enums.TRANSACTION.DIRECTION.DEBIT,
        amount: pooja.final_price,
        final_amount: pooja.final_price,
        opening_balance: userOpeningBalance,
        closing_balance: userWallet.balance,
        payment_method: Enums.PAYMENT.METHOD.WALLET,
        payment_provider: Enums.PAYMENT.PROVIDER.astrovedvanni,
        payment_status: Enums.PAYMENT.STATUS.PAID,
        related_entity_id: pooja_id.toString(),
        related_entity_type: Enums.ENTITY.TYPE.POOJA,
        remarks,
        timestamp,
      },
      {
        wallet_id: adminWallet._id,
        user_id: adminUserId,
        transaction_type: Enums.TRANSACTION.TYPE.POOJA,
        direction: Enums.TRANSACTION.DIRECTION.CREDIT,
        amount: pooja.final_price,
        final_amount: pooja.final_price,
        opening_balance: adminOpeningBalance,
        closing_balance: adminWallet.balance,
        payment_method: Enums.PAYMENT.METHOD.WALLET,
        payment_provider: Enums.PAYMENT.PROVIDER.astrovedvanni,
        payment_status: Enums.PAYMENT.STATUS.PAID,
        related_entity_id: pooja_id.toString(),
        related_entity_type: Enums.ENTITY.TYPE.POOJA,
        remarks: `${remarks} (Admin credit)`,
        timestamp,
      },
    ]);

    // Create booking
    const booking = await PoojaBooking.create({
      user_id: userId,
      pooja_id,
      scheduled_at: scheduledAt,
      special_notes,
      price_snapshot: {
        base_price: pooja.base_price,
        gst_percent: pooja.gst_percent,
        discount: pooja.discount,
        final_price: pooja.final_price,
      },
      booking_status: Enums.ORDER.STATUS.PENDING,
      payment_status: Enums.PAYMENT.STATUS.PAID,
    });

    // Create order
    await Order.create({
      user_id: userId,
      order_type: Enums.ORDER.TYPE.POOJA,
      reference_id: booking._id,
      quantity: 1,
      price_snapshot: {
        base_price: pooja.base_price,
        gst_percent: pooja.gst_percent,
        discount: pooja.discount,
        final_price: pooja.final_price,
      },
      total_payable: pooja.final_price,
      paid_amount: pooja.final_price,
      payment_status: Enums.PAYMENT.STATUS.PAID,
      payment_method: Enums.PAYMENT.METHOD.WALLET,
      tracking_status: Enums.ORDER.STATUS.PROCESSING,
    });

    return {
      ...booking.toObject(),
      scheduled_at_formatted: moment(booking.scheduled_at)
        .tz("Asia/Kolkata")
        .format("DD/MM/YYYY HH:mm"),
    };
  } catch (error) {
    logger.error("Error booking pooja:", error);
    throw error;
  }
};
exports.updatePoojaBooking = async (userId, bookingId, status, updateData) => {
  try {
    const booking = await PoojaBooking.findOne({
      _id: bookingId,
      user_id: userId,
    }).populate("pooja_id");

    if (!booking) throw new NotFoundError("Booking not found");

    if (
      [Enums.ORDER.STATUS.CANCELLED, Enums.ORDER.STATUS.DELIVERED].includes(
        booking.booking_status,
      )
    ) {
      throw new BadRequestError("This booking cannot be updated");
    }

    // -----------------------------
    // CANCEL BOOKING → REFUND
    // -----------------------------
    if (status === Enums.ORDER.STATUS.CANCELLED) {
      const userWallet = await Wallet.findOne({ user_id: userId });
      const adminUserId = await getAdminUserId();
      const adminWallet = await Wallet.findOne({ user_id: adminUserId });

      if (!userWallet || !adminWallet)
        throw new Error("Wallet not found for refund");

      const refundAmount = booking.price_snapshot.final_price;

      // 🔐 Capture opening balances
      const userOpeningBalance = userWallet.balance;
      const adminOpeningBalance = adminWallet.balance;

      // 🔁 Reverse balances
      userWallet.balance = Number(
        (userWallet.balance + refundAmount).toFixed(2),
      );
      adminWallet.balance = Number(
        (adminWallet.balance - refundAmount).toFixed(2),
      );

      await Promise.all([userWallet.save(), adminWallet.save()]);

      // 🔐 Capture closing balances
      const userClosingBalance = userWallet.balance;
      const adminClosingBalance = adminWallet.balance;

      // -----------------------------
      // LEDGER ENTRIES (WITH OPEN/CLOSE)
      // -----------------------------
      const remarks = `Pooja Cancelled: ${booking.pooja_id.name}`;
      const timestamp = new Date();

      await WalletLedger.create([
        {
          wallet_id: userWallet._id,
          user_id: userId,
          transaction_type: Enums.TRANSACTION.TYPE.POOJA,
          direction: Enums.TRANSACTION.DIRECTION.CREDIT,
          amount: refundAmount,
          final_amount: refundAmount,
          payment_method: Enums.PAYMENT.METHOD.WALLET,
          payment_provider: Enums.PAYMENT.PROVIDER.ASTROUP,
          payment_status: Enums.PAYMENT.STATUS.REFUNDED,
          related_entity_id: booking._id.toString(),
          related_entity_type: Enums.ENTITY.TYPE.POOJA,
          remarks,
          timestamp,
          opening_balance: userOpeningBalance,
          closing_balance: userClosingBalance,
        },
        {
          wallet_id: adminWallet._id,
          user_id: adminUserId,
          transaction_type: Enums.TRANSACTION.TYPE.POOJA,
          direction: Enums.TRANSACTION.DIRECTION.DEBIT,
          amount: refundAmount,
          final_amount: refundAmount,
          payment_method: Enums.PAYMENT.METHOD.WALLET,
          payment_provider: Enums.PAYMENT.PROVIDER.ASTROUP,
          payment_status: Enums.PAYMENT.STATUS.REFUNDED,
          related_entity_id: booking._id.toString(),
          related_entity_type: Enums.ENTITY.TYPE.POOJA,
          remarks: `${remarks} (Admin debit)`,
          timestamp,
          opening_balance: adminOpeningBalance,
          closing_balance: adminClosingBalance,
        },
      ]);

      // -----------------------------
      // UPDATE BOOKING + ORDER
      // -----------------------------
      booking.booking_status = Enums.ORDER.STATUS.CANCELLED;
      booking.payment_status = Enums.PAYMENT.STATUS.REFUNDED;
      await booking.save();

      await Order.findOneAndUpdate(
        {
          reference_id: booking._id,
          order_type: Enums.ORDER.TYPE.POOJA,
          user_id: userId,
        },
        {
          tracking_status: Enums.ORDER.STATUS.CANCELLED,
          payment_status: Enums.PAYMENT.STATUS.REFUNDED,
        },
      );

      return { message: "Booking cancelled and refunded successfully" };
    }

    // -----------------------------
    // RESCHEDULE FLOW (UNCHANGED)
    // -----------------------------
    const { scheduled_date, scheduled_time } = updateData;

    if (!scheduled_date || !scheduled_time)
      throw new BadRequestError("Please provide date and time to reschedule");

    const scheduledAt = moment(
      `${scheduled_date} ${scheduled_time}`,
      "DD/MM/YYYY HH:mm",
    ).toDate();

    if (scheduledAt < new Date())
      throw new BadRequestError("Cannot reschedule to a past time");

    booking.scheduled_at = scheduledAt;
    await booking.save();

    return { message: "Booking rescheduled successfully", booking };
  } catch (error) {
    logger.error("Error updating pooja booking:", error);
    throw error;
  }
};
exports.updatePoojaBookingAfterPayment = async (order) => {
  try {
    if (order.order_type === Enums.ORDER.TYPE.POOJA && order.reference_id) {
      await PoojaBooking.updateOne(
        { _id: order.reference_id },
        {
          booking_status: Enums.ORDER.STATUS.CONFIRMED,
          payment_status: Enums.PAYMENT.STATUS.PAID,
        },
      );
      logger.info("Pooja booking status updated after payment", {
        booking_id: order.reference_id,
      });
    }
  } catch (error) {
    logger.error("Error updating pooja booking after payment:", error);
    throw error;
  }
};
exports.getPoojaById = async (id, slug) => {
  let query = {};

  if (id) {
    query._id = id;
  } else if (slug) {
    query.slug = slug;
  } else {
    throw new Error("Pooja ID or slug is required");
  }

  const pooja = await PoojaMaster.findOne(query).lean();

  if (!pooja) {
    throw new Error("Pooja not found");
  }
  return pooja;
};
