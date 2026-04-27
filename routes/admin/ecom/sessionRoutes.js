const express = require("express");
const sessionController = require("../../../controller/admin/sessionController");

const router = express.Router();

router.get("/fetch-all", sessionController.getConsultationSessions);
router.get("/fetch-message", sessionController.fetchMessages);
module.exports = router;
