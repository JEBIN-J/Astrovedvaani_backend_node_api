const cartService = require("../../../services/user/astromall/cartService");

exports.getCart = async (req, res, next) => {
  try {
    const cart = await cartService.getUserCart(req.user._id);
    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.addItem = async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;
    const cart = await cartService.addItemToCart(
      req.user._id,
      productId,
      quantity,
    );
    res.json({
      success: true,
      data: cart,
      message: "Item added to cart",
    });
  } catch (error) {
    next(error);
  }
};

exports.updateItem = async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;
    const cart = await cartService.updateCartItem(
      req.user._id,
      productId,
      quantity,
    );
    res.json({
      success: true,
      data: cart,
      message: "Cart updated",
    });
  } catch (error) {
    next(error);
  }
};

exports.removeItem = async (req, res, next) => {
  try {
    const { productId } = req.query;
    const cart = await cartService.removeItemFromCart(req.user._id, productId);
    res.json({
      success: true,
      data: cart,
      message: "Item removed from cart",
    });
  } catch (error) {
    next(error);
  }
};

exports.applyCoupon = async (req, res, next) => {
  try {
    const { couponCode } = req.body;
    const cart = await cartService.applyCoupon(req.user._id, couponCode);
    res.json({
      success: true,
      data: cart,
      message: "Coupon applied successfully",
    });
  } catch (error) {
    next(error);
  }
};

exports.clearCart = async (req, res, next) => {
  try {
    await cartService.clearCart(req.user._id);
    res.json({
      success: true,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    next(error);
  }
};
exports.removeCoupon = async (req, res, next) => {
  try {
    const userId = req.body?.userId;

    const isAdmin = req.user.role === Enums.USER.ROLE.SUPER_ADMIN;

    // Admin must pass userId
    if (isAdmin && !userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required for admin",
      });
    }

    const targetUserId = isAdmin ? userId : req.user._id;

    const cart = await cartService.removeCoupon(targetUserId);

    res.json({
      success: true,
      data: cart,
      message: "Coupon removed successfully",
    });
  } catch (error) {
    next(error);
  }
};
