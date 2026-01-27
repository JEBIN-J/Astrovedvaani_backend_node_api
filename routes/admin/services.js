const express = require('express');
const router = express.Router();
const integrationController = require('../../controller/admin/ServiceController');

router.post('/integrations', integrationController.addService);
router.put('/integrations', integrationController.updateService);
router.patch('/integrations/toggle',integrationController.toggleActive);
router.get('/integrations',  integrationController.getAll);
router.delete('/integrations',integrationController.remove);

module.exports = router;