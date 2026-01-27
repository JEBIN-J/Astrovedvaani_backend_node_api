const express = require('express');
const ledgerController = require('../../controller/astrologer/ledgerController');

const router = express.Router();

router.get('/fetch-all',ledgerController.getMyLedger);
router.get('/fetch-analytics',ledgerController.getAstroAnalyticsController);

router.get('/withdraw-request', ledgerController.myWithdrawRequests);
router.post('/withdraw-request', ledgerController.withdrawRequest);
module.exports = router;