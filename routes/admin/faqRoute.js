const express = require('express');
const router = express.Router();
const faqController = require('../../controller/admin/faqController');

router.post('/add', faqController.addFAQ);
router.get('/fetch-all', faqController.getAllFAQs);
router.get('/fetch-by-id', faqController.getFAQById);
router.put('/update', faqController.updateFAQ);
router.delete('/delete', faqController.deleteFAQ);

module.exports = router;