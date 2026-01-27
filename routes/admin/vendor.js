const express = require('express');
const vendorController = require('../../controller/admin/vendorController');
const router = express.Router();

router.put('/update', vendorController.updateUser);

module.exports = router;
