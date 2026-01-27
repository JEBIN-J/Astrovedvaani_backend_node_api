const express = require("express");
const router = express.Router();

const {
  createBanner,
  getBanners,
  updateBanner,
  deleteBanner,
  setStaticPage,
  getStaticPage
} = require("../../controller/admin/contentController");

router.post("/carousel", createBanner);
router.get("/carousel-all", getBanners);
router.put("/carousel", updateBanner);
router.delete("/carousel", deleteBanner);

router.post("/static", setStaticPage);
router.get("/static", getStaticPage);

module.exports = router;
