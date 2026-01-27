const express = require('express');
const categoryController = require('../../../controller/admin/ecom/CategoryController');

const router = express.Router();

router.post('/create', categoryController.createCategory);
router.put('/update', categoryController.updateCategory);
router.delete('/delete', categoryController.deleteCategories);
router.get('/', categoryController.fetchAllCategories);
router.patch('/toggle', categoryController.toggleCategoryStatus);

module.exports = router;
