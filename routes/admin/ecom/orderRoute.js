const express = require('express');
const orderController = require('../../../controller/admin/ecom/orderController');
const router = express.Router();

router.get('/fetch-all', orderController.getAllOrders);
router.put('/update', orderController.updateOrder);
router.delete('/delete', orderController.deleteOrder);

module.exports = router;