const Product = require("../../../../models/Product");
const { addUserProductStatus } = require("./addUserProductStatus");

exports.getProductEssentials = async (productIds, userId = null) => {
  const products = await Product.find({ _id: { $in: productIds } })
    .select("_id name category_id final_price media slug summary description")
    .populate("category", "name slug")
    .lean();
  return await addUserProductStatus(products, userId);
};
