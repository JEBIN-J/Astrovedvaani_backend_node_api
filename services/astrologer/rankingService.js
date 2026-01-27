const Astrologer = require('../../models/Astrologer');
const AstrologerRanking = require('../../models/AstrologerRanking');
const logger = require('../../utils/logger');

// Constants
const MAX_SCORE = 100;

const SCORE_WEIGHTS = {
  PREMIUM: 0.25,
  ONLINE: 0.15,
  RATINGS: 0.20,
  ENGAGEMENT: 0.15,
  RESPONSE_TIME: 0.10,
  EXPERIENCE: 0.10,
  RECENCY_PENALTY: -0.10,
};

const MAX_RESPONSE_TIME = 300; // seconds
const MAX_EXPERIENCE_YEARS = 20;

function calculateAstrologerScore(astrologer) {
  const now = new Date();
  let score = 0;

  // 1. Premium
  if (astrologer.is_premium && (!astrologer.premium_expiry || astrologer.premium_expiry > now)) {
    const premiumBoost = Math.min(50, astrologer.premium_boost || 0);
    score += MAX_SCORE * SCORE_WEIGHTS.PREMIUM * (1 + premiumBoost / 100);
  }

  // 2. Online
  if (astrologer.is_online) {
    score += MAX_SCORE * SCORE_WEIGHTS.ONLINE;
  }

  // 3. Ratings
  const ratings = astrologer.ratings_avg || 0;
  const normalizedRating = ratings / 5;
  score += MAX_SCORE * SCORE_WEIGHTS.RATINGS * normalizedRating;

  // 4. Engagement Rate
  const engagement = Math.min(1, astrologer.engagement_rate || 0);
  score += MAX_SCORE * SCORE_WEIGHTS.ENGAGEMENT * engagement;

  // 5. Response Time
  const responseTime = Math.min(MAX_RESPONSE_TIME, astrologer.response_time_avg || MAX_RESPONSE_TIME);
  const responseScore = 1 - (responseTime / MAX_RESPONSE_TIME);
  score += MAX_SCORE * SCORE_WEIGHTS.RESPONSE_TIME * responseScore;

  // 6. Experience
  const experienceFactor = Math.min(1, (astrologer.experience_years || 0) / MAX_EXPERIENCE_YEARS);
  score += MAX_SCORE * SCORE_WEIGHTS.EXPERIENCE * experienceFactor;

  // 7. Recency Penalty
  const hoursSinceLastShown = astrologer.last_shown
    ? (now - astrologer.last_shown) / (1000 * 60 * 60)
    : 6;
  const penalty = Math.min(1, hoursSinceLastShown / 24);
  score += MAX_SCORE * SCORE_WEIGHTS.RECENCY_PENALTY * penalty;

  return Math.max(0, Math.min(MAX_SCORE, Math.round(score)));
}

async function updateAstrologerScores(astrologerIds = []) {
  try {
    const query = astrologerIds.length ? { _id: { $in: astrologerIds } } : {};
    const astrologers = await Astrologer.find(query).lean();

    const bulkOps = astrologers.map(astro => {
      const score = calculateAstrologerScore(astro);
      return {
        updateOne: {
          filter: { astrologer_id: astro._id },
          update: {
            $set: {
              ratings_avg: astro.ratings_avg || 0,
              engagement_rate: astro.engagement_rate || 0,
              response_time_avg: astro.response_time_avg || 0,
              session_completion_rate: astro.session_completion_rate || 0,
              score,
            }
          },
          upsert: true
        }
      };
    });

    if (bulkOps.length > 0) {
      await AstrologerRanking.bulkWrite(bulkOps);
      logger.info(`Updated ranking scores for ${bulkOps.length} astrologers`);
    }
  } catch (err) {
    logger.error('Failed to update astrologer scores:', err);
  }
}

// Modify the updateLastShown function to properly track engagement
async function updateLastShown(astrologerIds, clicked = false) {
  try {
    const now = new Date();
    const updateOps = {
      $set: { last_shown: now },
      $push: { last_shown_times: { $each: [now], $slice: -10 } },
      $inc: { show_count: 1 }
    };

    if (clicked) {
      updateOps.$inc.click_count = 1;
    }

    await AstrologerRanking.updateMany(
      { astrologer_id: { $in: astrologerIds } },
      updateOps
    );

    // Update engagement rate periodically
    if (Math.random() < 0.1) { // 10% chance to update
      await AstrologerRanking.updateMany(
        { astrologer_id: { $in: astrologerIds } },
        [{
          $set: {
            engagement_rate: {
              $cond: [
                { $eq: ["$show_count", 0] },
                0,
                { $divide: ["$click_count", "$show_count"] }
              ]
            }
          }
        }]
      );
    }
  } catch (err) {
    logger.error('Error updating last shown:', err);
  }
}



module.exports = {
  calculateAstrologerScore,
  updateAstrologerScores,
  updateLastShown
};
