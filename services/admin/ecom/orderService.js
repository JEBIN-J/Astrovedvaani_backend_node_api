const Order = require("../../../models/Order");
const Product = require("../../../models/Product");
const User = require("../../../models/User");
const Address = require("../../../models/Address");
const { getFeedBackBySourceId } = require("../feedBackService");
const { updateWalletAndLedger } = require("../../walletService");
const Enums = require("../../../utils/constants");

// exports.getAllOrders = async ({
//   page = 1,
//   limit = 10,
//   user_id,
//   order_type,
//   payment_status,
//   payment_method,
//   tracking_status,
//   start_date,
//   end_date,
//   search = '',
//   loginUser,
//   loginUserRole
// }) => {
//   const skip = (page - 1) * limit;
//   const match = {};

//   if (user_id) match.user_id = user_id;
//   if (order_type) match.order_type = parseInt(order_type);
//   if (payment_status) match.payment_status = parseInt(payment_status);
//   if (payment_method) match.payment_method = parseInt(payment_method);
//   if (tracking_status) match.tracking_status = parseInt(tracking_status);

//   if (start_date || end_date) {
//     match.createdAt = {};
//     if (start_date) match.createdAt.$gte = new Date(start_date);
//     if (end_date) match.createdAt.$lte = new Date(end_date);
//   }

//   if (search) {
//     match.$or = [
//       { remarks: { $regex: search, $options: "i" } },
//       { coupon_code: { $regex: search, $options: "i" } }
//     ];
//   }

//   const [orders, totalDocs] = await Promise.all([
//     Order.find(match)
//       .populate({
//         path: "user_id",
//         select: "name email mobileNumber profilePicture"
//       })
//       .populate({
//         path: "reference_id",
//         model: "Product",
//         select: "name slug images"
//       })
//       .populate({
//         path: "shipping_address",
//         select: "name phone line1 line2 city state pincode country"
//       })
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .lean(),

//     Order.countDocuments(match)
//   ]);

//   const enrichedOrders = await Promise.all(orders.map(async (order) => {
//   const feedback = await getFeedBackBySourceId(order._id);
//   return {
//     ...order,
//     rating: feedback?.rating ?? null,
//     review: feedback?.review ?? null
//   };
// }));

//   return {
//     orders: enrichedOrders,
//     totalDocs,
//     totalPages: Math.ceil(totalDocs / limit),
//     page,
//     limit
//   };
// };

exports.getAllOrders = async ({
  page = 1,
  limit = 10,
  user_id,
  order_type,
  payment_status,
  payment_method,
  tracking_status,
  start_date,
  end_date,
  search = "",
  role,
  currentUserId, // pass req.user._id here from controller
}) => {
  const skip = (page - 1) * limit;
  const match = {};

  if (user_id) match.user_id = user_id;
  if (order_type) match.order_type = parseInt(order_type);
  if (payment_status) match.payment_status = parseInt(payment_status);
  if (payment_method) match.payment_method = parseInt(payment_method);
  if (tracking_status) match.tracking_status = parseInt(tracking_status);

  if (start_date || end_date) {
    match.createdAt = {};

    if (start_date) {
      const start = new Date(start_date);
      start.setHours(0, 0, 0, 0);
      match.createdAt.$gte = start;
    }

    if (end_date) {
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
  }

  if (search) {
    match.$or = [
      { remarks: { $regex: search, $options: "i" } },
      { coupon_code: { $regex: search, $options: "i" } },
    ];
  }

  // 🚨 Vendor restriction
  let vendorMatch = {};
  if (role === Enums.USER.ROLE.VENDOR) {
    vendorMatch = { "reference_id.created_by": currentUserId };
  }

  const [orders, totalDocs] = await Promise.all([
    Order.find(match)
      .populate({
        path: "user_id",
        select: "name email mobileNumber profilePicture",
      })
      .populate({
        path: "reference_id",
        model: "Product",
        select:
          "name slug media.thumbnailImage media.url thumbnailImage created_by", // include created_by for vendor check
      })
      .populate({
        path: "shipping_address",
        select: "name phone line1 line2 city state pincode country",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Order.countDocuments(match),
  ]);

  // filter orders if vendor
  const filteredOrders =
    role === Enums.USER.ROLE.VENDOR
      ? orders.filter(
          (order) =>
            order.reference_id?.created_by?.toString() ===
            currentUserId.toString(),
        )
      : orders;

  const enrichedOrders = await Promise.all(
    filteredOrders.map(async (order) => {
      const feedback = await getFeedBackBySourceId(order._id);
      return {
        ...order,
        rating: feedback?.rating ?? null,
        review: feedback?.review ?? null,
      };
    }),
  );

  return {
    orders: enrichedOrders,
    totalDocs:
      role === Enums.USER.ROLE.VENDOR ? filteredOrders.length : totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  };
};

exports.updateOrder = async (id, updates) => {
  const allowedFields = [
    "payment_status",
    "payment_method",
    "tracking_status",
    "order_type",
    "remarks",
  ];

  const filteredUpdates = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  }

  const order = await Order.findById(id);
  if (!order) throw new Error("Order not found");
  if (updates.tracking_status === 1402) {
    const DAYS_TO_DELIVER = 5;
    filteredUpdates.expected_delivery_date = new Date(
      Date.now() + DAYS_TO_DELIVER * 24 * 60 * 60 * 1000,
    );
  }
  if (
    updates.payment_status === Enums.PAYMENT.STATUS.REFUNDED &&
    order.payment_status === Enums.PAYMENT.STATUS.PAID
  ) {
    if (order.paid_amount > 0) {
      await updateWalletAndLedger({
        userId: order.user_id,
        amount: order.paid_amount,
        remarks: `Admin refund for order ${order._id}`,
        transactionType: Enums.TRANSACTION.TYPE.REFUND,
        relatedEntityId: order._id,
        relatedEntityType:
          order.order_type === Enums.ORDER.TYPE.POOJA
            ? Enums.ENTITY.TYPE.POOJA
            : Enums.ENTITY.TYPE.PRODUCT,
      });
    }
  }

  const updatedOrder = await Order.findByIdAndUpdate(
    id,
    { $set: filteredUpdates },
    { new: true },
  )
    .populate("user_id", "name email mobileNumber profilePicture")
    .populate("reference_id", "name slug images")
    .populate(
      "shipping_address",
      "name phone line1 line2 city state pincode country",
    )
    .lean();

  return updatedOrder;
};

exports.deleteOrder = async (id) => {
  const order = await Order.findById(id);
  if (!order) throw new Error("Order not found");

  if (order.payment_status === Enums.PAYMENT.STATUS.PAID) {
    throw new Error("Cannot delete an order that has been paid");
  }

  const deletedOrder = await Order.findByIdAndDelete(id);
  return deletedOrder;
};
