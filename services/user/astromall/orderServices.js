const Order = require("../../../models/Order");
const Product = require("../../../models/Product");
const Address = require("../../../models/Address");
const Coupon = require("../../../models/Coupan");
const { trackProductView } = require("./recommendationService");
const { buildPaginationResponse } = require("../../../utils/pagination");
const { emitNewOrderToAdmins } = require("../../socket/orderSocket");
const Enums = require("../../../utils/constants");
const logger = require("../../../utils/logger");
const {
  BadRequestError,
  NotFoundError,
  ValidationError,
  InsufficientBalanceError,
} = require("../../../errors");
const { getWalletBalance } = require("../walletService");
const { updateWalletAndLedger } = require("../../walletService");
const Invoice = require("../../../models/Invoice");
const PoojaMaster = require("../../../models/Pooja");

const WALLET_GST_PERCENT = 18;
function calculateWalletDeduction(uiPrice, productGst) {
  uiPrice = Number(uiPrice || 0);
  productGst = Number(productGst || 0);
  if (uiPrice <= 0) return 0;
  const adjusted =
    (uiPrice * (1 + productGst / 100)) / (1 + WALLET_GST_PERCENT / 100);
  return Number(adjusted.toFixed(2));
}
exports.placeOrder = async (userId, orderData) => {
  logger.info(`[ORDER] placeOrder called by user: ${userId}`);
  const {
    product_id,
    quantity = 1,
    payment_method,
    shipping_address: shippingAddressId,
    coupon_code,
    order_type = null,
  } = orderData;
  const product = await Product.findById(product_id);
  if (!product || !product.is_active) {
    throw new NotFoundError("Invalid or inactive product");
  }
  const selling_price = Number(product.selling_price);
  const base_price = Number(product.base_price);
  const gst_percent = Number(product.gst_percent);
  const discount = Number(product.discount);
  let ui_final_price = selling_price;
  let couponDiscountAmount = 0;
  if (coupon_code) {
    const now = new Date();
    const coupon = await Coupon.findOne({
      code: coupon_code.toUpperCase(),
      is_active: true,
      valid_from: { $lte: now },
      valid_until: { $gte: now },
    });
    if (!coupon) {
      throw new ValidationError("Invalid or expired coupon code");
    }
    if (
      coupon.usage_limit !== null &&
      coupon.used_count >= coupon.usage_limit
    ) {
      throw new ValidationError("Coupon usage limit exceeded");
    }
    if (ui_final_price < coupon.min_cart_value) {
      throw new ValidationError(
        `Cart value must be at least ₹${coupon.min_cart_value}`,
      );
    }
    if (coupon.discount_type === "percentage") {
      couponDiscountAmount = (ui_final_price * coupon.discount_value) / 100;
    } else {
      couponDiscountAmount = coupon.discount_value;
    }
    couponDiscountAmount = Math.min(couponDiscountAmount, ui_final_price);
    couponDiscountAmount = Number(couponDiscountAmount.toFixed(2));
    ui_final_price = Number((ui_final_price - couponDiscountAmount).toFixed(2));
  }
  const wallet_deduction_per_unit = calculateWalletDeduction(
    ui_final_price,
    gst_percent,
  );
  const total_wallet_deduction = Number(
    (wallet_deduction_per_unit * quantity).toFixed(2),
  );
  const balance = await getWalletBalance(userId);
  if (balance < total_wallet_deduction) {
    throw new InsufficientBalanceError(
      `Insufficient wallet balance. Required: ₹${total_wallet_deduction}, Available: ₹${balance}`,
    );
  }
  const order = new Order({
    user_id: userId,
    order_type,
    reference_id: product._id,
    quantity,
    price_snapshot: {
      selling_price,
      base_price,
      gst_percent,
      discount,
      final_price: Number((ui_final_price + couponDiscountAmount).toFixed(2)),
    },
    coupon_code: coupon_code ? coupon_code.toUpperCase() : null,
    delivery_charge: 0,
    total_payable: total_wallet_deduction,
    paid_amount: total_wallet_deduction,
    payment_method,
    shipping_address: shippingAddressId,
  });
  await order.save();
  if (coupon_code) {
    await Coupon.updateOne(
      { code: coupon_code.toUpperCase() },
      { $inc: { used_count: 1 } },
    );
  }
  return order;
};
exports.updateOrder = async (userId, orderId, updateData) => {
  const order = await Order.findOne({ _id: orderId, user_id: userId });
  if (!order) throw new Error("Order not found");
  if (
    [Enums.ORDER.STATUS.DELIVERED, Enums.ORDER.STATUS.CANCELLED].includes(
      order.tracking_status,
    )
  ) {
    throw new Error("Cannot update a delivered or cancelled order");
  }
  if (updateData.cancel === true) {
    const cancellableStatuses = [
      Enums.ORDER.STATUS.PENDING,
      Enums.ORDER.STATUS.PLACED,
      Enums.ORDER.STATUS.PROCESSING,
    ];
    if (!cancellableStatuses.includes(order.tracking_status)) {
      throw new Error("Order cannot be cancelled at this stage");
    }
    order.tracking_status = Enums.ORDER.STATUS.CANCELLED;
    order.remarks = updateData.remarks || "Order cancelled by user";
    const isRefundAllowed =
      order.payment_status === Enums.PAYMENT.STATUS.PAID &&
      order.payment_method !== Enums.PAYMENT.METHOD.COD &&
      order.paid_amount > 0;

    if (isRefundAllowed) {
      await updateWalletAndLedger({
        userId: order.user_id,
        amount: order.paid_amount,
        remarks: `Refund for cancelled order ${order._id}`,
        transactionType: Enums.TRANSACTION.TYPE.REFUND,
        relatedEntityId: order._id,
      });

      order.payment_status = Enums.PAYMENT.STATUS.REFUNDED;
    }
  }
  if (updateData.quantity !== undefined) {
    if (updateData.quantity < 1) {
      throw new Error("Quantity must be at least 1");
    }
    if (order.payment_status === Enums.PAYMENT.STATUS.PAID) {
      throw new Error("Cannot modify quantity after payment");
    }
    const unitPrice = order.price_snapshot.final_price / order.quantity;
    const newTotal = unitPrice * updateData.quantity;
    order.quantity = updateData.quantity;
    order.total_payable = newTotal;
    order.price_snapshot.final_price = newTotal;
  }
  if (updateData.shipping_address) {
    const addressExists = await Address.findOne({
      _id: updateData.shipping_address,
      user_id: userId,
      is_active: true,
    });
    if (!addressExists) {
      throw new Error("Invalid shipping address");
    }
    order.shipping_address = updateData.shipping_address;
  }
  if (updateData.remarks) {
    order.remarks = updateData.remarks;
  }
  await order.save();
  return order;
};
exports.getOrderHistory = async (userId, filters) => {
  const {
    order_type,
    payment_status,
    tracking_status,
    from_date,
    to_date,
    name, //name filter
    page = 1,
    limit = 10,
  } = filters;

  const query = { user_id: userId };

  if (order_type) query.order_type = Number(order_type);
  if (payment_status) query.payment_status = Number(payment_status);
  if (tracking_status) query.tracking_status = Number(tracking_status);

  if (from_date || to_date) {
    query.createdAt = {};
    if (from_date) query.createdAt.$gte = new Date(from_date);
    if (to_date) query.createdAt.$lte = new Date(to_date);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [ordersRaw, totalDocs] = await Promise.all([
    Order.find(query)
      .populate("shipping_address")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Order.countDocuments(query),
  ]);

  if (!ordersRaw.length) {
    return {
      orders: [],
      pagination: buildPaginationResponse({
        totalDocs: 0,
        totalPages: 0,
        page,
        limit,
      }),
    };
  }
  const orderIds = ordersRaw.map((o) => o._id);

  const invoices = await Invoice.find({
    order_id: { $in: orderIds },
  })
    .select("order_id invoiceUrl invoice_number")
    .lean();

  const invoiceMap = invoices.reduce((acc, inv) => {
    acc[inv.order_id.toString()] = inv;

    return acc;
  }, {});
  const productReferenceIds = ordersRaw
    .filter((o) => o.order_type === Enums.ORDER.TYPE.PRODUCT)
    .map((o) => o.reference_id);

  const poojaReferenceIds = ordersRaw
    .filter((o) => o.order_type === Enums.ORDER.TYPE.POOJA)
    .map((o) => o.reference_id);

  let productMap = {};
  let poojaMap = {};

  if (productReferenceIds.length > 0) {
    const productQuery = { _id: { $in: productReferenceIds } };
    if (name) productQuery.name = { $regex: name, $options: "i" };

    const products = await Product.find(productQuery)
      .select("name media")
      .lean();

    productMap = products.reduce((acc, p) => {
      acc[p._id.toString()] = p;
      return acc;
    }, {});
  }

  if (poojaReferenceIds.length > 0) {
    const poojaQuery = { _id: { $in: poojaReferenceIds } };
    if (name) poojaQuery.name = { $regex: name, $options: "i" };

    const poojas = await PoojaMaster.find(poojaQuery)
      .select("name image_url")
      .lean();

    poojaMap = poojas.reduce((acc, p) => {
      acc[p._id.toString()] = p;
      return acc;
    }, {});
  }
  const orders = ordersRaw
    .map((order) => {
      const isUpdateAllowed =
        order.payment_status === Enums.PAYMENT.STATUS.PENDING &&
        ![Enums.ORDER.STATUS.CANCELLED, Enums.ORDER.STATUS.DELIVERED].includes(
          order.tracking_status,
        );

      let itemDetails = null;

      if (order.order_type === Enums.ORDER.TYPE.PRODUCT) {
        const product = productMap[order.reference_id?.toString()];
        if (product) {
          itemDetails = {
            type: "product",
            name: product.name,
            image: product.media?.[0]?.url || null,
          };
        }
      }

      if (order.order_type === Enums.ORDER.TYPE.POOJA) {
        const pooja = poojaMap[order.reference_id?.toString()];
        if (pooja) {
          itemDetails = {
            type: "pooja",
            name: pooja.name,
            image: pooja.image_url || null,
          };
        }
      }

      return {
        ...order,
        isUpdateAllowed,
        ...(itemDetails && { item: itemDetails }),
        invoice: invoiceMap[order._id.toString()] || null,
      };
    })
    .filter((o) => {
      if (!name) return true;
      return o.item && o.item.name.toLowerCase().includes(name.toLowerCase());
    });

  const totalFiltered = name ? orders.length : totalDocs;
  const totalPages = Math.ceil(totalFiltered / limit);

  const pagination = buildPaginationResponse({
    totalDocs: totalFiltered,
    totalPages,
    page: parseInt(page),
    limit: parseInt(limit),
  });

  return {
    orders,
    pagination,
  };
};
exports.getOrderById = async (userId, orderId) => {
  if (!orderId) throw new Error("orderId is required");

  // Fetch the order
  const order = await Order.findOne({ _id: orderId, user_id: userId })
    .populate("shipping_address")
    .lean();

  if (!order) return null; // order not found

  const isUpdateAllowed =
    order.payment_status === Enums.PAYMENT.STATUS.PENDING &&
    order.tracking_status !== Enums.ORDER.STATUS.CANCELLED &&
    order.tracking_status !== Enums.ORDER.STATUS.DELIVERED;

  // If order_type is PRODUCT, fetch product details
  let productDetails = null;
  if (order.order_type === Enums.ORDER.TYPE.PRODUCT) {
    const product = await Product.findById(order.reference_id)
      .select("name media")
      .lean();

    if (product) {
      productDetails = {
        product_id: order.reference_id,
        name: product.name,
        image: product.media?.[0]?.url || null,
      };
    }
  }
  const invoice = await Invoice.findOne({ order_id: orderId, user_id: userId })
    .select("invoiceUrl")
    .lean();

  return {
    ...order,
    isUpdateAllowed,
    ...(productDetails && { product: productDetails }),
    ...(invoice?.invoiceUrl && { invoiceUrl: invoice.invoiceUrl }),
  };

  // return {
  //   ...order,
  //   isUpdateAllowed,
  //   ...(productDetails && { product: productDetails }),
  // };
};
