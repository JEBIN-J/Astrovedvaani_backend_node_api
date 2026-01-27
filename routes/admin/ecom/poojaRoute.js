const express = require('express');
const poojaMasterController = require('../../../controller/admin/pooja/poojaMasterController');

const router = express.Router();

router.post('/add', poojaMasterController.upsertPooja);
router.put('/update', poojaMasterController.upsertPooja);
router.get('/fetch-by-id', poojaMasterController.getPoojaById);
router.get('/fetch-all', poojaMasterController.getAllPoojas);
router.delete('/delete-by-id', poojaMasterController.deletePooja);
router.patch('/toggle', poojaMasterController.togglePoojaStatus);

router.get('/fetch-all-booking', poojaMasterController.getAllBookingForPooja);
router.post('/assign-astrologer', poojaMasterController.assignOrReassignAstrologer);
router.post('/booking-status-update', poojaMasterController.updateBookingStatus);



module.exports = router;