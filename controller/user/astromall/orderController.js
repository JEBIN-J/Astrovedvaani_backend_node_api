const orderService = require("../../../services/user/astromall/orderServices");
const logger = require("../../../utils/logger");
const invoiceService = require("../../../services/user/astromall/InvoiceService");

exports.placeOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const orderData = req.body;
    const order = await orderService.placeOrder(userId, orderData);
    logger.info(
      `Order placed successfully. Order ID: ${order._id}, User: ${userId}`,
    );
    return res.status(201).json({ success: true, order });
  } catch (error) {
    logger.error("Error placing order:", error);
    return next(error);
  }
};

exports.getOrderHistory = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const filters = req.query;

    const result = await orderService.getOrderHistory(userId, filters);
    logger.info(`Order history fetched for user: ${userId}`);

    res.status(200).json({
      success: true,
      orders: result.orders,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error("Error fetching order history:", error);
    next(error);
  }
};
exports.getOrderById = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const orderId = req.query.orderId; // use /orders/:orderId

    const order = await orderService.getOrderById(userId, orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    logger.info(`Order fetched for user: ${userId}, orderId: ${orderId}`);

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    logger.error("Error fetching order by ID:", error);
    next(error);
  }
};

exports.getInvoices = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.query;

    const invoices = await invoiceService.getInvoices(userId, orderId);
    logger.info(`Invoices fetched for user: ${userId}`);

    return res.status(200).json({
      success: true,
      invoices,
    });
  } catch (error) {
    logger.error("Error fetching invoices:", error);
    next(error);
  }
};

exports.updateOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const orderId = req.query.id;
    const updateData = req.body;

    const updatedOrder = await orderService.updateOrder(
      userId,
      orderId,
      updateData,
    );

    logger.info(
      `Order updated successfully. Order ID: ${orderId}, User: ${userId}`,
    );

    return res.status(200).json({
      success: true,
      message: "Order updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    logger.error("Error updating order:", error);
    next(error);
  }
};
