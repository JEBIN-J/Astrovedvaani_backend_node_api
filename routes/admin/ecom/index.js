const express = require('express');
const router = express.Router();

const categoryRoutes = require('./category');
const poojaRoutes = require('./poojaRoute');
const orderRoutes = require('./orderRoute');
const sessionRoutes = require('./sessionRoutes');


router.use('/category', categoryRoutes);
router.use('/pooja', poojaRoutes);
router.use('/order', orderRoutes);
router.use('/session', sessionRoutes);


module.exports = router;