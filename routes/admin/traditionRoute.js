const express = require("express");
const traditionController = require("../../controller/admin/traditionController");

const router = express.Router();

router.post("/create", traditionController.createTradition);
router.put("/update", traditionController.updateTradition);
router.get("/fetch-all", traditionController.fetchTraditions);
router.get(
  "/fetch-by-id-or-slug/:idOrSlug",
  traditionController.fetchTraditionByIdOrSlug,
);
router.patch("/toggle", traditionController.toggleTraditionStatus);
router.delete("/delete", traditionController.deleteTradition);

module.exports = router;
