const express = require('express');
const controller = require('../../controller/astrologer/rateRequestController');

const router = express.Router();

router.post('/', controller.createRequest);
router.get('/', controller.getRequests);
router.put('/:requestId', controller.updateRequest);
router.delete('/:requestId', controller.deleteRequest);

module.exports = router;