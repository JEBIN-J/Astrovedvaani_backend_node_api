const express = require('express');
const router = express.Router();
const settingController = require('../../controller/admin/settingController');
const taxSlabController = require('../../controller/admin/taxSlabController');
const kundliController = require("../../controller/admin/kundliImageController");


router.get('/fetch-session', settingController.getSessionSetting);
router.post('/add-session', settingController.upsertSessionSetting);
router.put('/update-session', settingController.upsertSessionSetting);
router.get('/validation', settingController.getValidationSetting);
router.post('/add-validation', settingController.updateValidationSetting);
router.put('/update-validation', settingController.updateValidationSetting);

/* tax slab*/
router.get("/tax-slab/all",taxSlabController.getAllTaxSlab);
router.get("/tax-slab/by-id",taxSlabController.getTaxSlab);
router.post("/tax-slab/add",taxSlabController.createTaxSlab);
router.put("/tax-slab/update",taxSlabController.updateTaxSlab);
router.delete("/tax-slab/delete", taxSlabController.deleteTaxSlab);

/**kundli image */
router.post("/ki-add",kundliController.createKundlis);
router.put("/ki-update", kundliController.updateKundli);
router.get("/ki-getAll", kundliController.getAllKundlis);
router.delete("/ki-delete", kundliController.deleteKundli);

module.exports = router;



module.exports = router;