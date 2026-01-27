const express = require('express');
const router = express.Router();
const adminSkillsController = require('../../controller/admin/AstrologerSkillsAndLanguageController');

router.get('/lan/fetch-all', adminSkillsController.getLanguages);
router.post('/lan/add', adminSkillsController.addLanguage);
router.put('/lan/update', adminSkillsController.updateLanguage);
router.delete('/lan/delete', adminSkillsController.deleteLanguage);
router.get('/spe/fetch-all', adminSkillsController.getSpecializations);
router.post('/spe/add', adminSkillsController.addSpecialization);
router.put('/spe/update', adminSkillsController.updateSpecialization);
router.delete('/spe/delete', adminSkillsController.deleteSpecialization);

module.exports = router;
