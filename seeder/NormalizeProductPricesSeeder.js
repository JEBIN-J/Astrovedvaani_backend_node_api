const Product = require("../models/Product");
const logger = require("../utils/logger");

const ALLOWED_GST_SLABS = [0, 5, 10, 18];

const normalizeProductPricesSeeder = async () => {
  try {
    logger.info("🚀 Starting product price migration as per NEW PRD...");

    const products = await Product.find({});
    let updated = 0;
    let skipped = 0;

    for (const product of products) {
      const selling_price = Number(product.selling_price || 0);
      const discount = Number(product.discount || 0);

      // Basic sanity checks
      if (selling_price <= 0) {
        logger.warn(
          `⏭️ Skipped product ${product._id} (${product.name}) — invalid selling_price`,
        );
        skipped++;
        continue;
      }

      if (discount < 0 || discount > 100) {
        logger.warn(
          `⏭️ Skipped product ${product._id} (${product.name}) — invalid discount`,
        );
        skipped++;
        continue;
      }

      // Enforce GST slab safety (do not change value, only validate)
      if (
        product.gst_percent !== undefined &&
        !ALLOWED_GST_SLABS.includes(Number(product.gst_percent))
      ) {
        logger.warn(
          `⏭️ Skipped product ${product._id} (${product.name}) — invalid GST slab`,
        );
        skipped++;
        continue;
      }

      // NEW PRD LOGIC
      const base_price =
        discount > 0
          ? Number((selling_price * (1 + discount / 100)).toFixed(2))
          : 0;

      const final_price = selling_price;

      await Product.updateOne(
        { _id: product._id },
        {
          $set: {
            base_price,
            final_price,
          },
        },
      );

      updated++;

      logger.info(
        `✅ Updated ${product._id} | selling=${selling_price}, discount=${discount}%, base=${base_price}`,
      );
    }

    logger.info(
      `🎉 Product price migration completed. Updated=${updated}, Skipped=${skipped}`,
    );
  } catch (error) {
    logger.error("❌ Error running normalizeProductPricesSeeder:", error);
    throw error;
  }
};

module.exports = normalizeProductPricesSeeder;
