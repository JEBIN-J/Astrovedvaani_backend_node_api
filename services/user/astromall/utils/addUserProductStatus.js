const mongoose = require('mongoose');
const Cart = require('../../../../models/Cart');
const Wishlist = require('../../../../models/WishList');
const Enums = require('../../../../utils/constants');

exports.addUserProductStatus = async function (products, userId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return products.map(p => ({
      ...p,
      isCart: false,
      isWishlist: false
    }));
  }

  const productIds = products.map(p => p._id);

  const [cartItems, wishlistItems] = await Promise.all([
    Cart.find({
      user_id: userId,
      item_type: Enums.ORDER.TYPE.PRODUCT,
      reference_id: { $in: productIds }
    }).lean(),
    Wishlist.find({
      user_id: userId,
      item_type: Enums.ORDER.TYPE.PRODUCT,
      reference_id: { $in: productIds }
    }).lean()
  ]);

  const cartProductIds = new Set(cartItems.map(item => item.reference_id.toString()));
  const wishlistProductIds = new Set(wishlistItems.map(item => item.reference_id.toString()));

  return products.map(product => ({
    ...product,
    isCart: cartProductIds.has(product._id.toString()),
    isWishlist: wishlistProductIds.has(product._id.toString())
  }));
};
