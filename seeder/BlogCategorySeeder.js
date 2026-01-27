const BlogCategory = require('../models/BlogCategory');
const logger = require('../utils/logger');

const createDefaultCategories = async () => {
  const defaultCategories = [
    {
      name: 'Vedic Astrology',
      description: 'Traditional Indian astrology based on Vedic scriptures'
    },
    {
      name: 'Birth Chart Analysis',
      description: 'Detailed interpretations of individual birth charts'
    },
    {
      name: 'Planetary Transits',
      description: 'Effects of current planetary movements on zodiac signs'
    },
    {
      name: 'Gemstone Recommendations',
      description: 'Astrological gemstones and their benefits'
    },
    {
      name: 'Love & Relationships',
      description: 'Compatibility analysis and relationship guidance'
    },
    {
      name: 'Career Astrology',
      description: 'Career predictions and suitable professions'
    },
    {
      name: 'Remedial Measures',
      description: 'Poojas, mantras and remedies for planetary issues'
    },
    {
      name: 'Horoscope Predictions',
      description: 'Daily, weekly and monthly horoscopes'
    },
    {
      name: 'Muhurta',
      description: 'Auspicious timing for important events'
    },
    {
      name: 'Astrological Remedies',
      description: 'Solutions for astrological problems'
    }
  ];

  try {
    const existingCount = await BlogCategory.countDocuments();
    if (existingCount > 0) {
      logger.info('Categories already exist. Skipping seeding.');
      return;
    }

    const createdCategories = await BlogCategory.insertMany(defaultCategories);
    logger.info(`Successfully created ${createdCategories.length} astrology categories.`);
    
  } catch (error) {
    logger.error('Error seeding categories:', error);
  }
};

module.exports = createDefaultCategories;