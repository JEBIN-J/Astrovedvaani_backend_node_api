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

// Proxy tarot card images from the local Python API (ASTRO_ENGINE_URL), which
// only listens on localhost. Public: <img> tags can't send auth headers.
router.get("/tarot/images/:file", async (req, res) => {
  const axios = require("axios");
  const { file } = req.params;
  if (!/^[\w-]+\.(webp|png|jpe?g)$/i.test(file)) {
    return res.status(400).json({ success: false, message: "Invalid image name" });
  }
  // Same fallback as services/kundli/api.js
  const engineOrigin = (process.env.ASTRO_ENGINE_URL || "http://200.97.163.226/api/")
    .replace(/\/?$/, "/")
    .replace(/\/api\/$/, "");
  try {
    const upstream = await axios.get(
      `${engineOrigin}/api/tarot/images/${file}`,
      { responseType: "stream", timeout: 15000 },
    );
    res.set("Content-Type", upstream.headers["content-type"] || "image/webp");
    res.set("Cache-Control", "public, max-age=86400");
    upstream.data.pipe(res);
  } catch (err) {
    res.status(err.response?.status || 502).end();
  }
});
module.exports = router;
