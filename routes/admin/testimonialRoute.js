const express = require('express');
const router = express.Router();
const testimonialController = require('../../controller/admin/testimonialController');

router.post('/add', testimonialController.addTestimonial);
router.get('/fetch-all', testimonialController.getAllTestimonials);
router.get('/fetch-by-id', testimonialController.getTestimonialById);
router.put('/update', testimonialController.updateTestimonial);
router.delete('/delete', testimonialController.deleteTestimonial);

module.exports = router;