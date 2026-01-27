const express = require('express');
const poojaBookingController = require('../../controller/astrologer/poojaController');
const poojaController = require('../../controller/user/poojaController');

const router = express.Router();

router.get('/fetch-all',poojaBookingController.getPoojaBookings);
router.get('/fetch',poojaController.getAllPoojas);


module.exports = router;