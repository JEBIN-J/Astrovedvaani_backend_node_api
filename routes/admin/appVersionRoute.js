// routes/admin/appVersionRoutes.js
const express = require("express");
const appVersionController = require("../../controller/admin/appVersionController");

const router = express.Router();

router.post("/create", appVersionController.createAppVersion);
router.get("/list", appVersionController.getAppVersions);
router.get("/:id", appVersionController.getAppVersionById);
router.put("/:id", appVersionController.updateAppVersion);
router.delete("/:id", appVersionController.deleteAppVersion);
router.put("/:id/toggle-status", appVersionController.toggleStatus);

module.exports = router;
