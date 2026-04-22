const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middlewares/authMiddleware");
const authorizeRoles = require("../../middlewares/roleMiddleware");
const Enums = require("../../utils/constants");

router.use(authMiddleware);

const userRoutes = require("./user");
const ecomRoutes = require("./ecom");
const blogCmsRoutes = require("./blogRoute");
const contentRoutes = require("./contentRoutes");
const feedbackRoutes = require("./feedbackRoutes");
const settingRoutes = require("./setting");
const giftRoutes = require("./giftRoutes");
const replyTicketRoutes = require("./replyTicket");
const vendorRoutes = require("./vendor");
const lsRoutes = require("./lsRoutes");
const testimonialRoutes = require("./testimonialRoute");
const faqRoutes = require("./faqRoute");
const astrologerPriorityRoutes = require("./astrologerPriorityRoute");
const metaSeoRoutes = require("./metaSeoRoute");
const mediaContentRoutes = require("./mediaContent");
const dashboardRoutes = require("./dashboardRoute");
const astrologyServiceDetailsRoutes = require("./astrologyServiceDetailsRoutes");
const ledgerRoutes = require("./ledgerRoutes");
const serviceRoutes = require("./services");
const couponRoutes = require("./couponRoutes");
const rateRequestRoutes = require("./rateRequestRoutes");
const rechargeCardRoutes = require("./rechargeCardRoute");
const traditionRoutes = require("./traditionRoute");
const ADMIN = [Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN];
const ADMIN_VENDOR = [...ADMIN, Enums.USER.ROLE.VENDOR];
const SUPER_ADMIN = [Enums.USER.ROLE.SUPER_ADMIN];

router.use("/faq", authorizeRoles(...ADMIN), faqRoutes);
router.use("/testimonial", authorizeRoles(...ADMIN), testimonialRoutes);
router.use("/user", authorizeRoles(...ADMIN), userRoutes);
router.use("/ecom", authorizeRoles(...ADMIN_VENDOR), ecomRoutes);
router.use("/blog-cms", authorizeRoles(...ADMIN), blogCmsRoutes);
router.use("/content", authorizeRoles(...ADMIN), contentRoutes);
router.use("/feedback", authorizeRoles(...ADMIN), feedbackRoutes);
router.use("/setting", authorizeRoles(...ADMIN), settingRoutes);
router.use("/gift", authorizeRoles(...ADMIN), giftRoutes);
router.use("/coupon", authorizeRoles(...ADMIN), couponRoutes);
router.use("/reply-ticket", authorizeRoles(...ADMIN), replyTicketRoutes);
router.use("/vendor", authorizeRoles(...ADMIN_VENDOR), vendorRoutes);
router.use("/ls", authorizeRoles(...ADMIN_VENDOR), lsRoutes);

router.use("/ledger", authorizeRoles(...SUPER_ADMIN), ledgerRoutes);
router.use("/service", authorizeRoles(...SUPER_ADMIN), serviceRoutes);
router.use(
  "/astrologer-priority",
  authorizeRoles(...SUPER_ADMIN),
  astrologerPriorityRoutes,
);
router.use("/meta-seo", authorizeRoles(...SUPER_ADMIN), metaSeoRoutes);
router.use("/dashboard", authorizeRoles(...SUPER_ADMIN), dashboardRoutes);

router.use("/media-content", authorizeRoles(...ADMIN), mediaContentRoutes);
router.use(
  "/astrology-service-details",
  authorizeRoles(...ADMIN),
  astrologyServiceDetailsRoutes,
);
router.use("/rate-requests", authorizeRoles(...SUPER_ADMIN), rateRequestRoutes);
router.use(
  "/recharge-card",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  rechargeCardRoutes,
);
router.use(
  "/tradition",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  traditionRoutes,
);
module.exports = router;
