const express = require('express');
const router = express.Router();
const productController = require('../../controller/user/astromall/productController');
const categoryController = require('../../controller/user/astromall/categoryController');
const authMiddleware = require('../../middlewares/authMiddleware');
const wishlistController = require('../../controller/user/astromall/wishListController');
const cartController = require('../../controller/user/astromall/cartController');
const orderController = require('../../controller/user/astromall/orderController');


router.use(authMiddleware);

// Product routes
router.get('/products/search', productController.searchProducts);
router.get('/products/featured', productController.getFeaturedProducts);
router.get('/product-by-id', productController.getProduct);
router.get("/product-reviews", productController.getProductReviews);
// Category routes
router.get('/categories', categoryController.getCategoryTree);
router.get('/categories/featured', categoryController.getFeaturedCategories);
router.get('/categories-by-slug', categoryController.getCategory);
router.get('/categories/:slug/products', productController.getProductsByCategory);


// WishList routes
router.get('/wishlist', wishlistController.getWishlist);
router.post('/wishlist', wishlistController.addToWishlist);
router.delete('/wishlist',wishlistController.removeFromWishlist);

//cart routes
router.get('/cart', cartController.getCart);
router.post('/cart-items', cartController.addItem);
router.put('/cart-items', cartController.updateItem);
router.delete('/cart-items', cartController.removeItem);
router.post('/cart-coupons', cartController.applyCoupon);
router.delete('/cart-clear', cartController.clearCart);

//order
router.post('/place-order', orderController.placeOrder);
router.put('/update-order', orderController.updateOrder);
router.get('/fetch-my-order', orderController.getOrderHistory);
router.get('/order-by-id', authMiddleware, orderController.getOrderById);
router.get('/fetch-my-invoice', orderController.getInvoices);



module.exports = router;
