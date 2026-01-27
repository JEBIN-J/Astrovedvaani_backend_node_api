const express = require('express');
const router = express.Router();
const blogCategoryController = require('../../controller/admin/blogCategoryController');
const blogController = require('../../controller/admin/blogController');

// Blog Category Routes
router.post('/category/add', blogCategoryController.createCategory);
router.put('/category/update', blogCategoryController.updateCategory);
router.get('/category/fetch-all', blogCategoryController.getCategories);
router.get('/category/fetch-by-id', blogCategoryController.getCategory);
router.delete('/category/delete', blogCategoryController.deleteCategory);

// Blog Routes
router.post('/blog/add', blogController.addBlog);
router.put('/blog/update', blogController.updateBlog);
router.get('/blog/fetch-all', blogController.getBlogs);
router.get('/blog/fetch-by-id', blogController.getBlog);
router.delete('/blog/delete', blogController.deleteBlog);

module.exports = router;
