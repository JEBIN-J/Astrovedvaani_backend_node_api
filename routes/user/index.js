const express = require("express");
const router = express.Router();

const userRoutes = require("./user");
const ecomRoutes = require("./ecom");
const kundliRoutes = require("./kundliRoute");
const astroMallRoutes = require("./astroMall");
const poojaRoutes = require("./poojaRoute");
const addressRoutes = require("./address");
const supportTicketRoutes = require("../user/userSupportTicket");
const astrologyServiceDetailsRoutes = require("./astrologyServiceDetailsRoutes");

router.use("/v1", userRoutes);
router.use("/pooja", poojaRoutes);
router.use("/v2", ecomRoutes); // this is for admin or vendor or super admin
router.use("/kundli", kundliRoutes);
router.use("/astro-mall", astroMallRoutes);
router.use("/address", addressRoutes);
router.use("/support-ticket", supportTicketRoutes);
router.use("/astrology-service-details", astrologyServiceDetailsRoutes);

module.exports = router;
