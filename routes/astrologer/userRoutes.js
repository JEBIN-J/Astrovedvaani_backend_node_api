const express = require("express");
const userController = require("../../controller/astrologer/userController");
const userDeleteController = require("../../controller/user/UserController");
const router = express.Router();

router.get("/fetch-by-id", userController.getUserById);
router.get("/fetch-my-feedback", userController.getAstrologerFeedback);
router.delete("/delete-my-account", userDeleteController.deleteUser);
router.get("/user-profile", userController.getUserProfileById);
router.get("/fetch-complete-kundli", userController.getCompleteKundliByUserId);
router.get("/my-salary-slips", userController.getMySalarySlips);
module.exports = router;
