const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middlewares/authMiddleware");
const authorizeRoles = require("../../middlewares/roleMiddleware");
const Enums = require("../../utils/constants");

router.use(authMiddleware);
router.use(authorizeRoles(Enums.USER.ROLE.ASTROLOGER));

const profileRoutes = require("./profile");
const sessionRoutes = require("./sessionRoute");
const poojaRoutes = require("./poojaBookingRoutes");
const userRoutes = require("./userRoutes");
const ledgerRoutes = require("./ledgerRoutes");
const supportTicketRoutes = require("./astrologerSupportTicket");
router.use("/profile", profileRoutes);
router.use("/session", sessionRoutes);
router.use("/pooja-booking", poojaRoutes);
router.use("/pooja", poojaRoutes);
router.use("/user", userRoutes);
router.use("/ledger", ledgerRoutes);
router.use("/support-ticket", supportTicketRoutes);

module.exports = router;
