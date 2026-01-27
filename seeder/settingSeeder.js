const Setting = require('../models/Setting');
const logger = require('../utils/logger');

const createSetting = async () => {
  try {
    const existingSetting = await Setting.findOne({});
    if (existingSetting) {
      logger.info(`Default setting already exists. ID: ${existingSetting._id}`);
      return;
    }

    const defaultSetting = new Setting({
      isChatAllow: true,
      isVoiceCallAllow: true,
      isVideoCallAllow: true,
      isLiveStreamAllow: true,
      isAutoLogOutEnable: true,
      maxDeviceThreshold: 3,
    });

    await defaultSetting.save();
    logger.info('Default setting created successfully.');
  } catch (err) {
    logger.error('Error creating default setting:', err);
  }
};

module.exports = createSetting;
