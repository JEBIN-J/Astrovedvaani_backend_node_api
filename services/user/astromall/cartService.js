const Cart = require("../../../models/Cart");
const Product = require("../../../models/Product");
const Coupon = require("../../../models/Coupan");

// Helper function to format monetary values
const formatMoney = (value) => parseFloat(value.toFixed(2));

// Get or create user's cart with full product details
async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId })
    .populate({
      path: "items.product",
      select:
        "name sku base_price selling_price gst_percent discount media is_active",
    })
    .lean();

  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
    return getOrCreateCart(userId); // Recursive call to get populated cart
  }

  return cart;
}

// Calculate detailed cart information
function calculateCartDetails(cart) {
  let subtotal = 0;
  let productDiscount = 0;
  let couponDiscount = 0;
  let gstAmount = 0;
  let taxableAmount = 0;
  let grandTotal = 0;
  let totalQuantity = 0;

  // Process each cart item
  const items = cart.items.map((item) => {
    const product = item.product || {};
    const price = product.base_price || item.price || 0;
    const sellingPrice = product.selling_price || item.discounted_price || 0;
    const gstPercent = product.gst_percent || 0;
    const itemDiscount = price - sellingPrice;

    const lineSubtotal = price * item.quantity;
    const lineDiscount = itemDiscount * item.quantity;
    const lineTaxable = lineSubtotal - lineDiscount;
    const lineGst = lineTaxable * (gstPercent / 100);
    const lineTotal = lineTaxable + lineGst;

    subtotal += lineSubtotal;
    productDiscount += lineDiscount;
    taxableAmount += lineTaxable;
    gstAmount += lineGst;
    totalQuantity += item.quantity;

    return {
      productId: product._id || null,
      name: product.name || "Product not available",
      sku: product.sku || "",
      quantity: item.quantity,
      basePrice: formatMoney(price),
      sellingPrice: formatMoney(sellingPrice),
      gstPercent: formatMoney(gstPercent),
      itemSubtotal: formatMoney(lineSubtotal),
      itemDiscount: formatMoney(lineDiscount),
      itemTaxable: formatMoney(lineTaxable),
      itemGst: formatMoney(lineGst),
      itemTotal: formatMoney(lineTotal),
      thumbnail: product.media?.[0]?.url || null,
      isAvailable: product.is_active || false,
    };
  });

  // Apply coupon discount if exists
  if (cart.coupon) {
    if (cart.coupon.discount_type === "percentage") {
      couponDiscount = taxableAmount * (cart.coupon.discount_value / 100);
    } else {
      couponDiscount = Math.min(cart.coupon.discount_value, taxableAmount);
    }
    taxableAmount -= couponDiscount;
    taxableAmount = Math.max(0, taxableAmount); // Ensure not negative
  }

  grandTotal = taxableAmount + gstAmount;

  return {
    cartId: cart._id,
    userId: cart.user,
    items: items.filter((item) => item.productId), // Filter out invalid products
    summary: {
      totalItems: items.length,
      totalQuantity: totalQuantity,
      subtotal: formatMoney(subtotal),
      productDiscount: formatMoney(productDiscount),
      couponDiscount: formatMoney(couponDiscount),
      totalDiscount: formatMoney(productDiscount + couponDiscount),
      taxableAmount: formatMoney(taxableAmount),
      gstAmount: formatMoney(gstAmount),
      grandTotal: formatMoney(grandTotal),
    },
    coupon: cart.coupon || null,
    metadata: {
      createdAt: cart.created_at,
      updatedAt: cart.updated_at,
    },
  };
}

// Get user's cart with detailed information
exports.getUserCart = async (userId) => {
  try {
    const cart = await getOrCreateCart(userId);
    const cartData = calculateCartDetails(cart);

    return {
      success: true,
      data: cartData,
    };
  } catch (error) {
    console.error("Cart Service Error:", error);
    return {
      success: false,
      message: "Failed to retrieve cart",
      error: error.message,
    };
  }
};

// Add item to cart
exports.addItemToCart = async (userId, productId, quantity = 1) => {
  try {
    if (quantity < 1) {
      throw new Error("Quantity must be at least 1");
    }

    const product = await Product.findById(productId);
    if (!product || !product.is_active) {
      throw new Error("Product not available");
    }

    const cart = await getOrCreateCart(userId);
    const existingItem = cart.items.find(
      (item) => item.product && item.product._id.equals(productId),
    );

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({
        product: productId,
        quantity,
        price: product.base_price,
        discounted_price: product.selling_price,
      });
    }

    await Cart.updateOne(
      { _id: cart._id },
      { $set: { items: cart.items, updated_at: new Date() } },
    );

    return await exports.getUserCart(userId);
  } catch (error) {
    console.error("Add to Cart Error:", error);
    return {
      success: false,
      message: error.message,
    };
  }
};

// Update cart item quantity
exports.updateCartItem = async (userId, productId, quantity) => {
  try {
    if (quantity < 1) {
      throw new Error("Quantity must be at least 1");
    }

    const cart = await getOrCreateCart(userId);
    const itemIndex = cart.items.findIndex(
      (item) => item.product && item.product._id.equals(productId),
    );

    if (itemIndex === -1) {
      throw new Error("Item not found in cart");
    }

    cart.items[itemIndex].quantity = quantity;

    await Cart.updateOne(
      { _id: cart._id },
      { $set: { items: cart.items, updated_at: new Date() } },
    );

    return await exports.getUserCart(userId);
  } catch (error) {
    console.error("Update Cart Error:", error);
    return {
      success: false,
      message: error.message,
    };
  }
};

// Remove item from cart
exports.removeItemFromCart = async (userId, productId) => {
  try {
    const cart = await getOrCreateCart(userId);
    const initialItemCount = cart.items.length;

    cart.items = cart.items.filter(
      (item) => !(item.product && item.product._id.equals(productId)),
    );

    if (cart.items.length === initialItemCount) {
      throw new Error("Item not found in cart");
    }

    await Cart.updateOne(
      { _id: cart._id },
      { $set: { items: cart.items, updated_at: new Date() } },
    );

    return await exports.getUserCart(userId);
  } catch (error) {
    console.error("Remove Item Error:", error);
    return {
      success: false,
      message: error.message,
    };
  }
};

// Apply coupon to cart
exports.applyCoupon = async (userId, couponCode) => {
  try {
    const coupon = await Coupon.findOne({
      code: couponCode,
      is_active: true,
    });

    if (!coupon) {
      throw new Error("Invalid coupon code");
    }

    // Check coupon validity dates
    const now = new Date();
    if (coupon.valid_from && coupon.valid_from > now) {
      throw new Error("Coupon is not yet valid");
    }
    if (coupon.valid_to && coupon.valid_to < now) {
      throw new Error("Coupon has expired");
    }

    // Check coupon usage limits
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      throw new Error("Coupon usage limit reached");
    }

    const cart = await getOrCreateCart(userId);

    // Check minimum cart value if specified
    if (coupon.min_cart_value) {
      const cartData = calculateCartDetails(cart);
      if (cartData.summary.subtotal < coupon.min_cart_value) {
        throw new Error(
          `Cart must contain at least ${coupon.min_cart_value} to use this coupon`,
        );
      }
    }

    cart.coupon = {
      code: coupon.code,
      discount_value: coupon.discount_value,
      discount_type: coupon.discount_type,
      couponId: coupon._id,
    };

    await Cart.updateOne(
      { _id: cart._id },
      { $set: { coupon: cart.coupon, updated_at: new Date() } },
    );

    return await exports.getUserCart(userId);
  } catch (error) {
    console.error("Apply Coupon Error:", error);
    return {
      success: false,
      message: error.message,
    };
  }
};

exports.removeCoupon = async (userId) => {
  try {
    const cart = await getOrCreateCart(userId);

    if (!cart.coupon) {
      throw new Error("No coupon applied to cart");
    }

    await Cart.updateOne(
      { _id: cart._id },
      { $set: { coupon: null, updated_at: new Date() } },
    );

    return await exports.getUserCart(userId);
  } catch (error) {
    console.error("Remove Coupon Error:", error);
    return {
      success: false,
      message: error.message,
    };
  }
};

// Clear cart completely
exports.clearCart = async (userId) => {
  try {
    await Cart.updateOne(
      { user: userId },
      { $set: { items: [], coupon: null, updated_at: new Date() } },
    );

    return {
      success: true,
      message: "Cart cleared successfully",
    };
  } catch (error) {
    console.error("Clear Cart Error:", error);
    return {
      success: false,
      message: "Failed to clear cart",
    };
  }
};

exports.getCartSummary = async (userId) => {
  try {
    const cart = await getOrCreateCart(userId);
    const cartData = calculateCartDetails(cart);

    return {
      success: true,
      data: {
        cartId: cartData.cartId,
        summary: cartData.summary,
        itemCount: cartData.items.length,
      },
    };
  } catch (error) {
    console.error("Cart Summary Error:", error);
    return {
      success: false,
      message: "Failed to get cart summary",
    };
  }
};
