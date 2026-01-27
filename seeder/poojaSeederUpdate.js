const logger = require("../utils/logger");
const PoojaMaster = require("../models/Pooja");
const calculateFinalPrice = (basePrice, gstPercent, discountPercent) => {
  const discountedPrice = basePrice - (basePrice * discountPercent) / 100;
  const gstAmount = (discountedPrice * gstPercent) / 100;
  return parseFloat((discountedPrice + gstAmount).toFixed(2));
};

const seedPooja = async () => {
  try {
    const poojas = await PoojaMaster.find({});
    logger.info(`Found ${poojas.length} poojas`);
    let updatedCount = 0;

    for (const pooja of poojas) {
      const { base_price, gst_percent = 0, discount = 0 } = pooja;
      const finalPrice = calculateFinalPrice(base_price, gst_percent, discount);
      if (pooja.final_price !== finalPrice) {
        pooja.final_price = finalPrice;
        await pooja.save();
        updatedCount++;
        logger.info(`Updated "${pooja.name}" → final: ₹${finalPrice}`);
      }
    }
    logger.info(`Updated ${updatedCount} poojas successfully`);
  } catch (err) {
    logger.error("Error seeding poojas:", err);
    process.exit(1);
  }
};
module.exports = seedPooja;
