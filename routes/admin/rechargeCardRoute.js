const express = require("express");
const router = express.Router();
const {
  createRechargeCard,
  getAllRechargeCards,
  getRechargeCardById,
  updateRechargeCard,
  deleteRechargeCard,
} = require("../../controller/admin/rechargeCardController");

// Create card (Admin only)
router.post("/create", createRechargeCard);

router.get("/fetch-all", getAllRechargeCards);

// Get single card
router.get("/fetch", getRechargeCardById);

// Update card (Admin only)
router.put("/update", updateRechargeCard);

// Delete card (Admin only)
router.delete("/delete", deleteRechargeCard);

module.exports = router;
