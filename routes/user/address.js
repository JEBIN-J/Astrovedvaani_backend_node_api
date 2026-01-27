const express = require('express');
const authMiddleware = require('../../middlewares/authMiddleware');
const addressController = require('../../controller/user/addressController');

const router = express.Router();

router.get('/fetch-all',authMiddleware,addressController.getAddresses);
router.post('/add',authMiddleware,addressController.createAddress);
router.put('/update',authMiddleware,addressController.updateAddress);


module.exports = router;