const express = require("express");
const router = express.Router();

const authRoutes = require("./auth");
const adminRoutes = require("./admin/index");
const userRoutes = require("./user/index");
const astrologerRoutes = require("./astrologer/index");
const fileRoutes = require("./fileRoutes");
const paymentRoutes = require("./paymentRoutes");
const notificationRoutes = require("./notificationRoutes");
const publicRoutes = require("./publicRoutes");
const authController = require("../controller/authController");
const ksRoutes = require("./ksRoute");

router.delete('/admin/clear-busy/:astrologerId', async (req, res) => {
    const CacheService = require('../utils/redis/cacheService');
    await CacheService.clearAstrologerBusy(req.params.astrologerId);
    res.json({ success: true });
});
router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/user", userRoutes);
router.use("/astrologer", astrologerRoutes);
router.use("/file", fileRoutes);
router.use("/payment", paymentRoutes);
router.use("/notification", notificationRoutes);
router.use("/public", publicRoutes);
router.use("/ks", ksRoutes);
router.post("/user_send_otp", authController.sendEmailOtp);
module.exports = router;
