const express = require("express");
const router = express.Router();
const MediaContentController = require("../../controller/admin/mediaContentController");

router.post("/create", MediaContentController.createMedia);
router.get("/fetch-all", MediaContentController.getAllMedia);
router.get("/fetch", MediaContentController.getMediaById);
router.put("/update", MediaContentController.updateMedia);
router.delete("/delete", MediaContentController.deleteMedia);

module.exports = router;
