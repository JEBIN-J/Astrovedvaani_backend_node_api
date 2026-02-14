const express = require("express");
const router = express.Router();

const controller = require("../../controller/admin/astrologyServiceDetailsController");

router.post("/add", controller.addAstrologyService);
router.put("/update", controller.updateAstrologyService);
router.get("/fetch-all", controller.getAstrologyServices);
router.get("/fetch-by-id", controller.getAstrologyService);
router.delete("/delete", controller.deleteAstrologyService);

module.exports = router;
