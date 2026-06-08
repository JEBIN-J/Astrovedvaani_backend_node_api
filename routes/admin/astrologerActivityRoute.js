const express = require("express");

const router = express.Router();

const astrologerActivityController = require("../../controller/admin/astrologerActivitycontroller");

// GET /admin/astrologer/:astrologerId/activity
router.get(
  "/",
  astrologerActivityController.getAstrologerActivity,
);

module.exports = router;
