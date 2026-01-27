const asyncHandler = require('../../middlewares/asyncHandler');
const sessionSettingService = require('../../services/admin/session/sessionSetting');
const settingService = require('../../services/admin/validationSetting');

const logger = require('../../utils/logger');

exports.getSessionSetting = async (req, res, next) => {
  try {
    const setting = await sessionSettingService.getSessionSetting();
    logger.info(`Session setting fetched`);
    return res.status(200).json({
      success: true,
      data: setting || {},
    });
  } catch (error) {
    logger.error('Error fetching session setting:', error);
    next(error);
  }
};

exports.upsertSessionSetting = async (req, res, next) => {
  try {
     const { _id, ...sanitizedBody } = req.body;
    const updated = await sessionSettingService.upsertSessionSetting(sanitizedBody);
    logger.info('Session setting upserted by admin');
    return res.status(200).json({
      success: true,
      message: 'Session setting updated',
      data: updated,
    });
  } catch (error) {
    logger.error('Error updating session setting:', error);
    next(error);
  }
};

exports.getValidationSetting = asyncHandler(async (req, res) => {
  const setting = await settingService.getValidationSetting();
  logger.info(`Validation setting fetched`);
  res.status(200).json({
    success: true,
    data: setting,
  });
});

exports.updateValidationSetting = asyncHandler(async (req, res) => {
   const { _id, ...sanitizedBody } = req.body;
  const updatedSetting = await settingService.updateValidationSetting(sanitizedBody);
  logger.info(`Validation setting updated`);
  res.status(200).json({
    success: true,
    data: updatedSetting,
  });
});

