const express = require("express");
const ledgerController = require("../../controller/admin/ledgerController");

const router = express.Router();
router.get("/fetch-all", ledgerController.getUserLedger);
router.get("/analytics", ledgerController.getAdminAnalyticsController);
router.put("/withdraw-request", ledgerController.updateWithdrawalRequest);
router.get("/withdraw-request", ledgerController.getWithdrawalRequests);
router.post("/wallet/adjust", ledgerController.adjustWallet);

module.exports = router;
