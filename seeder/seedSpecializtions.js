const Specialization = require("../models/Specialization");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");

const SPECIALIZATIONS = [
  /* ----------- EXPERTISE ----------- */
  { name: "ASTROLOGY", related_to: Enums.SPECIALIZATION.RELATED_TO.EXPERTISE },
  { name: "TAROT", related_to: Enums.SPECIALIZATION.RELATED_TO.EXPERTISE },
  { name: "VASTU", related_to: Enums.SPECIALIZATION.RELATED_TO.EXPERTISE },
  { name: "NUMEROLOGY", related_to: Enums.SPECIALIZATION.RELATED_TO.EXPERTISE },
  { name: "PALMISTRY", related_to: Enums.SPECIALIZATION.RELATED_TO.EXPERTISE },
  { name: "GEMOLOGY", related_to: Enums.SPECIALIZATION.RELATED_TO.EXPERTISE },
  { name: "YOGA", related_to: Enums.SPECIALIZATION.RELATED_TO.EXPERTISE },
  { name: "MEDITATION", related_to: Enums.SPECIALIZATION.RELATED_TO.EXPERTISE },

  /* ----------- DOMAINS ----------- */
  { name: "HEALTH", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
  { name: "LOVE", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
  { name: "CAREER", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
  { name: "FINANCE", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
  { name: "SPIRITUALITY", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
  { name: "EDUCATION", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
  { name: "RELATIONSHIP", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
  { name: "CHILD", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
  { name: "PET", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
  { name: "TRAVEL", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
  { name: "HOBBIES", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
  { name: "EVENTS", related_to: Enums.SPECIALIZATION.RELATED_TO.DOMAIN },
];

const seedSpecializations = async () => {
  try {
    for (const item of SPECIALIZATIONS) {
      const exists = await Specialization.findOne({ name: item.name });

      if (!exists) {
        // CREATE
        await Specialization.create({
          name: item.name,
          related_to: item.related_to,
          isActive: true,
        });

        logger.info(`✅ Created: ${item.name}`);
      } else {
        // UPDATE related_to if changed
        let updated = false;

        if (exists.related_to !== item.related_to) {
          exists.related_to = item.related_to;
          updated = true;
        }

        if (!exists.isActive) {
          exists.isActive = true;
          updated = true;
        }

        if (updated) {
          await exists.save();
          logger.info(`🔄 Updated: ${item.name}`);
        } else {
          logger.info(`⏩ No change: ${item.name}`);
        }
      }
    }

    logger.info("🎯 Specialization seeding completed");
  } catch (err) {
    logger.error("❌ Error seeding specializations:", err);
  }
};

module.exports = seedSpecializations;
