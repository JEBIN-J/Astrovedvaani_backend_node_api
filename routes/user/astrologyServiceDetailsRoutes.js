const express = require("express");
const router = express.Router();

const controller = require("../../controller/user/astrologyServiceDetailsController");

router.get("/fetch-all", controller.getAstrologyServices);
router.get("/fetch-by-category", controller.getAstrologyService);

module.exports = router;
