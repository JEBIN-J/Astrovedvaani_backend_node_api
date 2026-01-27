const express = require('express');
const router = express.Router();
const giftController = require('../../controller/admin/giftController');

router.post('/add', giftController.addGift);
router.get('/fetch-all', giftController.getAllGifts);
router.get('/fetch-by-id', giftController.getGiftById);
router.put('/update', giftController.updateGift);
router.delete('/delete', giftController.deleteGift);

module.exports = router;