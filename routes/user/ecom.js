const express = require('express');
const authMiddleware = require('../../middlewares/authMiddleware');
const authorizeRoles = require('../../middlewares/roleMiddleware');
const Enums = require('../../utils/constants');
const productController = require('../../controller/ecom/ProductController')

const router = express.Router();

router.post('/add-product',authMiddleware,authorizeRoles(Enums.USER.ROLE.ADMIN,Enums.USER.ROLE.VENDOR,Enums.USER.ROLE.SUPER_ADMIN),
productController.addProduct);
router.put('/update-product',authMiddleware,authorizeRoles(Enums.USER.ROLE.ADMIN,Enums.USER.ROLE.VENDOR,Enums.USER.ROLE.SUPER_ADMIN),
productController.updateProduct);
router.get('/fetch-product',authMiddleware,authorizeRoles(Enums.USER.ROLE.ADMIN,Enums.USER.ROLE.VENDOR,Enums.USER.ROLE.SUPER_ADMIN),
productController.getProducts);
router.delete('/delete-product',authMiddleware,authorizeRoles(Enums.USER.ROLE.ADMIN,Enums.USER.ROLE.VENDOR,Enums.USER.ROLE.SUPER_ADMIN),
productController.deleteProducts);


module.exports = router;