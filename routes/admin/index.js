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
const replyTicket = require("./replyTicket");
const vendorRoutes = require("./vendor");
const lsRoutes = require("./lsRoutes");
const testimonialRoutes = require("./testimonialRoute");
const faqRoutes = require("./faqRoute");
const astrologerPriorityRoutes = require("./astrologerPriorityRoute");
const metaSeoRoutes = require("./metaSeoRoute");
const mediaContentRoutes = require("./mediaContent");
const dashboardRoutes = require("./dashboardRoute");
router.use(
  "/faq",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  faqRoutes,
);
router.use(
  "/testimonial",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  testimonialRoutes,
);
router.use(
  "/user",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  userRoutes,
);
router.use(
  "/ecom",
  authorizeRoles(
    Enums.USER.ROLE.ADMIN,
    Enums.USER.ROLE.SUPER_ADMIN,
    Enums.USER.ROLE.VENDOR,
  ),
  ecomRoutes,
);
router.use(
  "/blog-cms",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  blogCmsRoutes,
);
router.use(
  "/content",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  contentRoutes,
);
router.use(
  "/feedback",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  feedbackRoutes,
);
router.use(
  "/setting",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  settingRoutes,
);
router.use(
  "/gift",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  giftRoutes,
);
router.use(
  "/coupon",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  require("./couponRoutes"),
);
router.use(
  "/reply-ticket",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  replyTicket,
);
router.use(
  "/vendor",
  authorizeRoles(
    Enums.USER.ROLE.ADMIN,
    Enums.USER.ROLE.SUPER_ADMIN,
    Enums.USER.ROLE.VENDOR,
  ),
  vendorRoutes,
);
router.use(
  "/ls",
  authorizeRoles(
    Enums.USER.ROLE.ADMIN,
    Enums.USER.ROLE.SUPER_ADMIN,
    Enums.USER.ROLE.VENDOR,
  ),
  lsRoutes,
);

const ledgerRoutes = require("./ledgerRoutes");
const serviceRoutes = require("./services");

router.use(
  "/ledger",
  authorizeRoles(Enums.USER.ROLE.SUPER_ADMIN),
  ledgerRoutes,
);
router.use(
  "/service",
  authorizeRoles(Enums.USER.ROLE.SUPER_ADMIN),
  serviceRoutes,
);
router.use(
  "/astrologer-priority",
  authorizeRoles(Enums.USER.ROLE.SUPER_ADMIN),
  astrologerPriorityRoutes,
);
router.use(
  "/meta-seo",
  authorizeRoles(Enums.USER.ROLE.SUPER_ADMIN),
  metaSeoRoutes,
);
router.use(
  "/media-content",
  authorizeRoles(Enums.USER.ROLE.ADMIN, Enums.USER.ROLE.SUPER_ADMIN),
  mediaContentRoutes,
);
router.use(
  "/dashboard",
  authorizeRoles(Enums.USER.ROLE.SUPER_ADMIN),
  dashboardRoutes,
);
module.exports = router;
