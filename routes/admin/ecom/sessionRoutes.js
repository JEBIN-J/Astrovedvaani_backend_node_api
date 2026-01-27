const express = require('express');
const sessionController = require('../../../controller/admin/sessionController');

const router = express.Router();

router.get('/fetch-all', sessionController.getConsultationSessions);

module.exports = router;
