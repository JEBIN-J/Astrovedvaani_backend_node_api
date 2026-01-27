const Specialization = require('../models/Specialization');
const logger = require('../utils/logger');

const SPECIALIZATIONS = [
  'ASTROLOGY',
  'TAROT',
  'VASTU',
  'NUMEROLOGY',
  'PALMISTRY',
  'GEMOLOGY',
  'YOGA',
  'MEDITATION',
  'HEALTH',
  'LOVE',
  'CAREER',
  'FINANCE',
  'SPIRITUALITY',
  'EDUCATION',
  'RELATIONSHIP',
  'CHILD',
  'PET',
  'TRAVEL',
  'HOBBIES',
  'EVENTS'
];

const seedSpecializations = async () => {
  try {
    for (const name of SPECIALIZATIONS) {
      const exists = await Specialization.findOne({ name });
      if (!exists) {
        await new Specialization({ name, isActive: true }).save();
        logger.info(`Specialization created: ${name}`);
      } else {
        logger.info(`Specialization already exists: ${name}`);
      }
    }
  } catch (err) {
    logger.error('Error seeding specializations:', err);
  }
};

module.exports = seedSpecializations;
