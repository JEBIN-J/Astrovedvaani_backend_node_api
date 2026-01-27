
const wishlistService = require('../../../services/user/astromall/wishListService');
const { buildPaginationResponse } = require('../../../utils/pagination');
exports.addToWishlist = async (req, res, next) => {
  try {
    const { item_type, reference_id } = req.body;
    const userId = req.user._id;

    const exists = await wishlistService.isInWishlist(userId, item_type, reference_id);
    if (exists) {
      return res.status(409).json({ message: 'Item already in wishlist' });
    }

    const item = await wishlistService.addItem(userId, item_type, reference_id);
    return res.status(201).json(item);
  } catch (err) {
    next(err);
  }
};

exports.removeFromWishlist = async (req, res, next) => {
  try {
    const { reference_id } = req.body;
    const userId = req.user._id;

    const deleted = await wishlistService.removeItem(userId, reference_id);
    if (!deleted) {
      return res.status(404).json({ message: 'Item not found in wishlist' });
    }

    return res.status(200).json({ message: 'Item removed from wishlist' });
  } catch (err) {
    next(err);
  }
};


exports.getWishlist = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const { docs, totalDocs, totalPages } = await wishlistService.getUserWishlist(userId, { page, limit });

    return res.status(200).json({
      items: docs,
      pagination: buildPaginationResponse({ totalDocs, totalPages, page, limit }),
    });
  } catch (err) {
    next(err);
  }
};

