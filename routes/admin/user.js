const express = require("express");
const adminUserController = require("../../controller/admin/UserController");
const walletController = require("../../controller/admin/walletController");
const notifyController = require("../../controller/admin/notifyController");

const router = express.Router();

router.post("/create", adminUserController.createUser);
router.post("/profile-complete", adminUserController.completeUser);
router.get("/fetch", adminUserController.fetchUsers);
router.patch("/toggle", adminUserController.toggleUserVerificationStatus);
router.patch("/block", adminUserController.blockUser);
router.get("/fetch-balance", walletController.getCurrentBalance);
router.delete("/delete", adminUserController.deleteUser);
router.patch("/restore", adminUserController.restoreUser);
router.patch("/refresh", adminUserController.refreshUser);
router.post("/send", notifyController.sendAdminNotification);
router.get("/fetch-salary-slips", adminUserController.getSalarySlips);
module.exports = router;
