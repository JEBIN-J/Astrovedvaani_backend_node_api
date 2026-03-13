const express = require("express");
const authMiddleware = require("../../middlewares/authMiddleware");
const userController = require("../../controller/user/UserController");
const profileController = require("../../controller/user/profileController");
const sessionController = require("../../controller/user/SessionController");
const ledgerController = require("../../controller/user/ledgerController");
const walletController = require("../../controller/user/walletController");
const feedbackController = require("../../controller/user/feedbackController");
const sessionLiveController = require("../../controller/astrologer/sessionController");
const userGiftController = require("../../controller/user/giftController");
const giftController = require("../../controller/admin/giftController");
const chatController = require("../../controller/user/UserController");
const coupanController = require("../../controller/admin/coupanController");
const adminSkillsController = require("../../controller/admin/AstrologerSkillsAndLanguageController");
const configController = require("../../controller/admin/ServiceController");
const router = express.Router();

router.get("/fetch-astrologers", authMiddleware, userController.getAstrologers);
router.get(
  "/fetch-astrologer-by-id",
  authMiddleware,
  userController.getAstrologerById,
);
router.get(
  "/fetch-review-by-astrologer-id",
  authMiddleware,
  userController.getReviewsByAstrologerId,
);
router.post(
  "/profile/create-or-update",
  authMiddleware,
  profileController.completeProfile,
);
router.get("/fetch-my-profile", authMiddleware, profileController.getMyProfile);
router.delete("/delete-my-account", authMiddleware, userController.deleteUser);
router.get(
  "/session-history",
  authMiddleware,
  sessionController.fetchSessionHistory,
);
router.get("/fetch-my-ledger", authMiddleware, ledgerController.getUserLedger);
router.get(
  "/fetch-my-balance",
  authMiddleware,
  walletController.getCurrentBalance,
);
router.post(
  "/wallet/initiate-recharge",
  authMiddleware,
  walletController.initiateRecharge,
);
router.post(
  "/wallet/confirm-recharge",
  authMiddleware,
  walletController.confirmRecharge,
);
router.post("/feedback/add", authMiddleware, feedbackController.addMyFeedback);
router.get(
  "/feedback/fetch-all",
  authMiddleware,
  feedbackController.getMyFeedbacks,
);
router.put(
  "/feedback/update-by-id",
  authMiddleware,
  feedbackController.updateMyFeedback,
);
router.delete(
  "/feedback/delete-by-id",
  authMiddleware,
  feedbackController.deleteMyFeedback,
);
router.patch(
  "/follow-unfollow",
  authMiddleware,
  userController.toggleFollowAstrologer,
);
router.get("/user-follow-list", authMiddleware, userController.getUserFollows);
router.post("/live/join", authMiddleware, sessionLiveController.joinLive);
router.post("/live/leave", authMiddleware, sessionLiveController.leaveLive);
router.post(
  "/live/comment",
  authMiddleware,
  sessionLiveController.commentOnLive,
);
router.get(
  "/live/fetch-astro-live",
  authMiddleware,
  sessionController.getAvailableLiveSessions,
);
router.post("/gift/buy", authMiddleware, userGiftController.buyGift);
router.get("/gift/fetch-all", authMiddleware, giftController.getAllGifts);
router.post("/gift/send", authMiddleware, userGiftController.sendGift);
router.get("/gift/my-purchase", authMiddleware, userGiftController.getMyGifts);
router.get("/coupon/fetch-all", authMiddleware, coupanController.getAllCoupons);
router.get(
  "/coupon/fetch-by-id",
  authMiddleware,
  coupanController.getCouponById,
);
router.get(
  "/chat/conversation",
  authMiddleware,
  chatController.getConversation,
);
router.get("/chat/list", authMiddleware, chatController.getChatList);
router.get("/global-search", authMiddleware, userController.globalSearch);
router.get("/filter", authMiddleware, adminSkillsController.getSkills);
router.get(
  "/getConfigByType",
  authMiddleware,
  configController.getConfigByType,
);
module.exports = router;
