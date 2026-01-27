// scripts/initRankings.js
const Astrologer = require('../models/Astrologer');
const AstrologerRanking = require('../models/AstrologerRanking');
const logger = require('../utils/logger');

async function initializeRankings() {
  try {
    // Get all astrologers without rankings
    console.log('inside ')
    const astrologers = await Astrologer.find();
    const existingRankings = await AstrologerRanking.find().select('astrologer_id');
    const existingAstrologerIds = existingRankings.map(r => r.astrologer_id.toString());
    
    // Create missing rankings
    const newRankings = astrologers
      .filter(a => !existingAstrologerIds.includes(a._id.toString()))
      .map(astro => ({
        astrologer_id: astro._id,
        score: 0 // Initial score
      }));
    
    if (newRankings.length > 0) {
      await AstrologerRanking.insertMany(newRankings);
      logger.info(`Created ${newRankings.length} new ranking entries`);
    }
    
    logger.info('Ranking initialization complete');
  } catch (err) {
    logger.error('Ranking initialization failed:', err);
  }
}

module.exports = initializeRankings;