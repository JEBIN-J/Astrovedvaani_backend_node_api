const express = require("express");
const router = express.Router();

const {
  createPromotion,
  listPromotions,
  deactivatePromotion,
  updatePromotion,
} = require("../../controller/admin/astrologerPromotionController");

router.post("/create", createPromotion);
router.put("/update/:id", updatePromotion);
router.get("/fetch-all", listPromotions);
router.delete("/delete/:id", deactivatePromotion);

module.exports = router;
