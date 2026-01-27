// controllers/user/paymentController.js
const paymentService = require('../services/paymentService');

exports.initiateOrderPayment = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { order_id, method, provider } = req.body;

    const result = await paymentService.initiateOrderPayment(
      userId,
      order_id,
      method,
      provider
    );

    res.status(200).json({
      success: true,
      message: 'Payment initiation successful',
      data: result
    });
  } catch (err) {
    next(err);
  }
};

exports.confirmOrderPayment = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const paymentInfo = req.body;

    const result = await paymentService.confirmOrderPayment(userId, paymentInfo);

    res.status(200).json({
      success: true,
      message: 'Payment confirmed',
      data: result
    });
  } catch (err) {
    next(err);
  }
};
