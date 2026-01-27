const express = require("express");
const bodyParser = require("body-parser");
const authMiddleware = require("../middlewares/authMiddleware");
const paymentController = require("../controller/paymentController");
const walletController = require("../controller/user/walletController");

const router = express.Router();
router.post("/order/initiate-payment", authMiddleware, paymentController.initiateOrderPayment);
router.post("/order/confirm-payment", authMiddleware, paymentController.confirmOrderPayment);

module.exports = router;
