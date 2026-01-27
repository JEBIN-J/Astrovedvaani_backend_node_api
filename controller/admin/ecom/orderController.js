const orderService = require("../../../services/admin/ecom/orderService");
const { buildPaginationResponse } = require("../../../utils/pagination");
const logger = require("../../../utils/logger");

exports.getAllOrders = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      user_id,
      order_type,
      payment_status,
      payment_method,
      tracking_status,
      start_date,
      end_date,
      search = ''
    } = req.query;
    const currentUserId = req.user._id;
    const role = req.user.role;

    const filters = {
      page: parseInt(page),
      limit: parseInt(limit),
      user_id,
      order_type,
      payment_status,
      payment_method,
      tracking_status,
      start_date,
      end_date,
      search,
      role,
      currentUserId
    };

    logger.info("Admin fetching order list", { filters });

    const result = await orderService.getAllOrders(filters);

    res.status(200).json({
      success: true,
      data: result.orders,
      pagination: buildPaginationResponse(result)
    });
  } catch (error) {
    next(error);
  }
};
exports.updateOrder = async (req, res, next) => {
  try {
    const { id } = req.query;
    const updates = req.body;
    const updatedOrder = await orderService.updateOrder(id, updates);
    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.status(200).json({
      success: true,
      message: "Order updated successfully",
      data: updatedOrder
    });
  } catch (error) {
    next(error);
  }
};
exports.deleteOrder = async (req, res, next) => {
  try {
    const id = req.query.id || req.query._id;
    const deleted = await orderService.deleteOrder(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.status(200).json({
      success: true,
      message: "Order deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};

