const express = require('express');
const astrologerController = require('../../controller/astrologer/AstrologerController');
const sessionController = require('../../controller/astrologer/sessionController');

const router = express.Router();

router.put('/create-or-update',astrologerController.completeProfile);
router.put('/service-rate',astrologerController.updateServiceRate);
router.get('/',astrologerController.getLoggedInUserProfile);
router.get('/session-history',sessionController.getConsultationSessions);

router.post('/live/schedule', sessionController.scheduleLive);
router.post('/live/start', sessionController.startLive);
router.post('/live/end', sessionController.endLive);
router.put('/live/update',sessionController.updateLive);
router.delete('/live/delete', sessionController.deleteLive);
router.get('/live/my-sessions', sessionController.getMyLiveSessions);


module.exports = router;