const express = require('express');
const astrologerController = require('../../controller/astrologer/AstrologerController');

const router = express.Router();

router.put('/create-or-update',astrologerController.completeProfile);
router.put('/service-rate',astrologerController.updateServiceRate);
router.get('/',astrologerController.getLoggedInUserProfile);
router.put('/update-availability-status',astrologerController.updateAvailabilityStatus);
router.get('/fetch-availability-status',astrologerController.getAvailabilityStatus);

module.exports = router;