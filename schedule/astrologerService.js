const cron = require('node-cron');
const { updateAstrologerScores } = require('../services/astrologer/rankingService');
const logger = require('../utils/logger');

// Update all scores every hour
cron.schedule('0 * * * *', () => {
  updateAstrologerScores();
  logger.info('Scheduled astrologer score update completed');
});

// Update recently active astrologers more frequently (every 5 minutes)
cron.schedule('*/5 * * * *', async () => {
  const activeAstrologers = await Astrologer.find({
    updatedAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  }).select('_id');
  
  updateAstrologerScores(activeAstrologers.map(a => a._id));
});