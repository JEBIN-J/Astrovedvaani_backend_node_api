const Language = require('../models/Language');
const logger = require('../utils/logger');

const LANGUAGES = [
  'ENGLISH',
  'HINDI',
  'TAMIL',
  'TELUGU',
  'KANNADA',
  'MALAYALAM',
  'BENGALI',
  'MARATHI',
  'GUJARATI',
  'PUNJABI'
];

const seedLanguages = async () => {
  try {
    for (const name of LANGUAGES) {
      const exists = await Language.findOne({ name });
      if (!exists) {
        await new Language({ name, isActive: true }).save();
        logger.info(`Language created: ${name}`);
      } else {
        logger.info(`Language already exists: ${name}`);
      }
    }
  } catch (err) {
    logger.error('Error seeding languages:', err);
  }
};

module.exports = seedLanguages;
