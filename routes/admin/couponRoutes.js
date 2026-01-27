const express = require('express');
const router = express.Router();
const couponController = require('../../controller/admin/coupanController');

router.post('/add', couponController.addCoupon);
router.get('/fetch-all', couponController.getAllCoupons);
router.get('/fetch-by-id', couponController.getCouponById);
router.put('/update', couponController.updateCoupon);
router.delete('/delete', couponController.deleteCoupon);

module.exports = router;
