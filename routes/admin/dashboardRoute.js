const express = require("express");
const router = express.Router();

const dashboardController = require("../../controller/admin/dashboardController");

router.get("/overview", dashboardController.getOverview);
router.get("/communication", dashboardController.getCommunicationSummary);
router.get("/earnings", dashboardController.getEarnings);
router.get("/wallet", dashboardController.getWalletSummary);
router.get("/recent-users", dashboardController.getRecentUsers);
router.get("/recent-orders", dashboardController.getRecentOrders);
router.get("/all", dashboardController.getDashboardAll);

module.exports = router;
