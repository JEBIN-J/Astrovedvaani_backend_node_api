const express = require("express");
const astrologerController = require("../../controller/astrologer/AstrologerController");
const astrologerOfferController = require("../../controller/astrologer/offerController");

const router = express.Router();

router.put("/create-or-update", astrologerController.completeProfile);
router.put("/service-rate", astrologerController.updateServiceRate);
router.get("/", astrologerController.getLoggedInUserProfile);

router.put(
  "/update-availability-status",
  astrologerController.updateAvailabilityStatus,
);
router.get(
  "/fetch-availability-status",
  astrologerController.getAvailabilityStatus,
);

// Create or replace all offers
router.put("/offers", astrologerOfferController.createOrUpdateOffers);

// Get all offers
router.get("/offers", astrologerOfferController.getOffers);
router.delete(
  "/offers/:service_type",
  astrologerOfferController.deleteOfferByServiceType,
);

// Delete all offers
router.delete("/offers", astrologerOfferController.deleteAllOffers);

module.exports = router;
