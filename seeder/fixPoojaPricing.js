const mongoose = require("mongoose");
const PoojaMaster = require("../models/Pooja");
const logger = require("../utils/logger");

const normalizePoojaPricingNewPRD = ({ selling_price, discount }) => {
  selling_price = Number(selling_price || 0);
  discount = Number(discount || 0);

  if (selling_price <= 0) {
    throw new Error("Invalid selling_price");
  }

  if (discount < 0 || discount > 100) {
    discount = 0; // safety
  }

  const base_price =
    discount > 0
      ? Number((selling_price * (1 + discount / 100)).toFixed(2))
      : 0;

  return {
    selling_price,
    base_price,
    discount,
    final_price: selling_price,
  };
};
const migratePoojaPricingSeeder = async () => {
  try {
    logger.info("Starting Pooja pricing migration (NEW PRD)...");
    const poojas = await PoojaMaster.find({});
    let updated = 0;
    let skipped = 0;

    for (const pooja of poojas) {
      try {
        const selling_price = Number(pooja.selling_price || pooja.final_price);
        const discount = Number(pooja.discount || 0);
        if (!selling_price || selling_price <= 0) {
          logger.warn(
            `⏭Skipped ${pooja._id} (${pooja.name}) — invalid selling_price`,
          );
          skipped++;
          continue;
        }
        const pricing = normalizePoojaPricingNewPRD({
          selling_price,
          discount,
        });
        const needsUpdate =
          pooja.selling_price !== pricing.selling_price ||
          pooja.base_price !== pricing.base_price ||
          pooja.final_price !== pricing.final_price ||
          pooja.discount !== pricing.discount;
        if (needsUpdate) {
          pooja.selling_price = pricing.selling_price;
          pooja.base_price = pricing.base_price;
          pooja.discount = pricing.discount;
          pooja.final_price = pricing.final_price;
          await pooja.save();
          updated++;

          logger.info(
            `Updated ${pooja._id} | selling=${pricing.selling_price}, discount=${pricing.discount}%, base=${pricing.base_price}`,
          );
        }
      } catch (innerErr) {
        logger.error(
          `Failed migrating pooja ${pooja._id} (${pooja.name}):`,
          innerErr.message,
        );
        skipped++;
      }
    }
    logger.info(
      `Pooja pricing migration complete. Updated=${updated}, Skipped=${skipped}`,
    );
  } catch (err) {
    logger.error("Pooja pricing migration failed:", err);
    throw err;
  }
};
module.exports = migratePoojaPricingSeeder;
