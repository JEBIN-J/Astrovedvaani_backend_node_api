const SessionSetting = require('../models/SessionSetting');
const Enums = require('../utils/constants');
const logger = require('../utils/logger');

const createSessionSetting = async () => {
  try {
    const existingSetting = await SessionSetting.findOne({});
    if (existingSetting) {
      logger.info(`Session setting already exists. ID: ${existingSetting._id}`);
      return;
    }

    const defaultSetting = new SessionSetting({
      enableFreeSession: false,
      freeSessionMinutes: 2,
      maxFreeSessionsPerUser: 1,
      freeSessionUsageInterval: Enums.SESSION_INTERVAL.LIFETIME,
      eligibleRolesForFreeSession: [Enums.USER.ROLE.USER],
      notes: 'Default session setting',
      isActive: true,
    });

    await defaultSetting.save();
    logger.info('Default session setting created successfully.');
  } catch (err) {
    logger.error('Error creating session setting:', err);
  }
};

module.exports = createSessionSetting;
