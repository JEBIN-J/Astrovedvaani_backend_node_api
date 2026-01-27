const Pooja = require('../../../models/Pooja');
const Product = require('../../../models/Product');
const Wishlist = require('../../../models/WishList');
const Enums = require('../../../utils/constants');

const addItem = async (userId, item_type, reference_id) => {
  try {
    return await Wishlist.create({ user_id: userId, item_type, reference_id });
  } catch (err) {
    throw new Error('Failed to add item to wishlist');
  }
};

const removeItem = async (userId, reference_id) => {
  try {
    return await Wishlist.findOneAndDelete({ user_id: userId,reference_id });
  } catch (err) {
    throw new Error('Failed to remove item from wishlist');
  }
};

const getUserWishlist = async (userId, { page = 1, limit = 10 }) => {
  try {
    const query = { user_id: userId };
    const wishlistItems = await Wishlist.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const totalItems = await Wishlist.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    const productIds = [];
    const poojaIds = [];
    const serviceIds = [];

    for (const item of wishlistItems) {
      switch (item.item_type) {
        case Enums.ORDER.TYPE.PRODUCT:
          productIds.push(item.reference_id);
          break;
        case Enums.ORDER.TYPE.POOJA:
          poojaIds.push(item.reference_id);
          break;
        case Enums.ORDER.TYPE.SERVICE:
          serviceIds.push(item.reference_id);
          break;
      }
    }

    const [products, poojas] = await Promise.all([
      productIds.length > 0 ? Product.find({ _id: { $in: productIds }, is_active: true })
        .select('name media final_price selling_price discount base_price')
        .lean() : [],
      poojaIds.length > 0 ? Pooja.find({ _id: { $in: poojaIds }, is_active: true }).lean() : []
      // Add similar call for Service if needed
    ]);

    const productMap = createIdMap(products);
    const poojaMap = createIdMap(poojas);

    const enrichedItems = wishlistItems.map(item => {
      if (item.item_type === Enums.ORDER.TYPE.PRODUCT) {
        return productMap[item.reference_id.toString()] || null;
      } else if (item.item_type === Enums.ORDER.TYPE.POOJA) {
        return poojaMap[item.reference_id.toString()] || null;
      } else {
        return null; // Can handle SERVICE later
      }
    }).filter(Boolean); // Remove nulls (unresolved/deleted references)

    return {
      docs: enrichedItems,
      totalDocs: totalItems,
      totalPages,
    };

  } catch (err) {
    throw new Error('Failed to fetch wishlist');
  }
};

function createIdMap(items) {
  return items.reduce((map, item) => {
    map[item._id.toString()] = item;
    return map;
  }, {});
}




const isInWishlist = async (userId, item_type, reference_id) => {
  try {
    return await Wishlist.exists({ user_id: userId, item_type, reference_id });
  } catch (err) {
    throw new Error('Failed to check wishlist status');
  }
};

module.exports = {
  addItem,
  removeItem,
  getUserWishlist,
  isInWishlist,
};
