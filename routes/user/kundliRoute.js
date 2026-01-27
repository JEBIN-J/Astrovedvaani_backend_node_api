const express = require('express');
const authMiddleware = require('../../middlewares/authMiddleware');
const matchMakingController = require('../../controller/user/kundli/matchMakingController');

const router = express.Router();

router.get('/match-making',authMiddleware,matchMakingController.getMatchMakingReport);
module.exports = router;