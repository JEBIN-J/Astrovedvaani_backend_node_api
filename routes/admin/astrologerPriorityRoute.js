const express = require("express");
const router = express.Router();

const {
  addAstrologerPriority,
  updateAstrologerPriority,
  fetchAllPrioritizedAstrologers,
} = require("../../controller/admin/setAstrologerPriorityController");

// ADMIN
router.post("/add", addAstrologerPriority);
router.put("/update", updateAstrologerPriority);
router.get("/fetch-all", fetchAllPrioritizedAstrologers);
module.exports = router;
