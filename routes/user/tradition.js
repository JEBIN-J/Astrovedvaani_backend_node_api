const express = require("express");
const traditionController = require("../../controller/user/traditionController");

const router = express.Router();

router.get("/fetch", traditionController.getTraditions);
router.get("/fetch-id-or-slug", traditionController.getTraditionBySlugOrId);

module.exports = router;
