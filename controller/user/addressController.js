const addressService = require('../../services/user/addressService');
const logger = require('../../utils/logger');

// Create Address
exports.createAddress = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const data = req.body;

    const address = await addressService.createAddress(userId, data);
    logger.info(`Address created for user: ${userId}`);
    return res.status(201).json({ success: true, address });
  } catch (error) {
    logger.error('Error creating address:', error);
    next(error);
  }
};

// Update Address
exports.updateAddress = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const addressId = req.query.id;
    const updates = req.body;

    const address = await addressService.updateAddress(userId, addressId, updates);
    logger.info(`Address updated: ${addressId} for user: ${userId}`);
    return res.status(200).json({ success: true, address });
  } catch (error) {
    logger.error('Error updating address:', error);
    next(error);
  }
};

// Get All Addresses (Paginated)
exports.getAddresses = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const query = req.query;

    const result = await addressService.getAddresses(userId, query);
    return res.status(200).json({
      success: true,
      addresses: result.addresses,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Error fetching addresses:', error);
    next(error);
  }
};
