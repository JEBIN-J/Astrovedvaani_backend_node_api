const express = require("express");
const router = express.Router();
const metaSeoController = require("../../controller/admin/metaSeoController");

router.post("/add", metaSeoController.createMeta);
router.put("/update", metaSeoController.createMeta);
router.get("/fetch-all", metaSeoController.getMetaList);
router.get("/fetch-by-id", metaSeoController.getMeta);
router.put("/toggle-status", metaSeoController.toggleMetaStatus);

module.exports = router;
