const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const userAstrologyController = require("../controller/kundliSection/userAstrologyController");
const userKundliController = require("../controller/kundliSection/userKundliController");
const panchangaController = require("../controller/kundliSection/panchangaController");
const horosopeController = require("../controller/kundliSection/horoscopeController");
const kundliController = require("../controller/kundliSection/kundliController");
const transitDoshaController = require("../controller/kundliSection/transitDoshaController");
const authKundliMiddleware = require("../middlewares/authkundliMiddlware");
const tarotController = require("../controller/kundliSection/tarotController");
const { auth } = require("firebase-admin");
const laalKitaabController = require("../controller/kundliSection/laalKitaabController");
router.post(
  "/profile/add",
  authMiddleware,
  userAstrologyController.createKundli,
);
router.get(
  "/profile/fetch-my-kundli",
  authMiddleware,
  userAstrologyController.getMyKundlis,
);
router.get(
  "/profile/fetch-my-match-making",
  authMiddleware,
  userAstrologyController.getMyMatchMaking,
);
router.get(
  "/profile/fetch-my-palmistry",
  authMiddleware,
  userAstrologyController.getMyPalmistry,
);
router.get(
  "/profile/fetch-my-kundli",
  authMiddleware,
  userAstrologyController.getMyKundlis,
);
router.get(
  "/profile/fetch-by-id",
  authMiddleware,
  userAstrologyController.getMyKundlisById,
);
router.put(
  "/profile/update",
  authMiddleware,
  userAstrologyController.updateKundli,
);
router.delete(
  "/profile/delete",
  authMiddleware,
  userAstrologyController.deleteKundli,
);
router.get("/city-suggetsion", userAstrologyController.getCitySuggestion);

// Match Making
router.get(
  "/match-making",
  authKundliMiddleware,
  userKundliController.getMatchMaking,
);

// Panchanga & Horoscope
router.get("/panchanga", panchangaController.getPanchang);
router.get("/horoscope", authKundliMiddleware, horosopeController.getHoroscope);
router.get(
  "/horoscope/small-section",
  authMiddleware,
  horosopeController.getBigHoroscope,
);
router.get(
  "/horoscope/good-bad-days",
  authKundliMiddleware,
  horosopeController.getGoodBadDays,
);

// Kundli
router.get("/kundli/basic-details", authMiddleware, kundliController.getKundli);
router.get(
  "/kundli/details",
  authMiddleware,
  kundliController.getKundliDetails,
);
router.get("/kundli/kp-details", authMiddleware, kundliController.getKPDetails);
router.get(
  "/kundli/ashtakvarga-charts",
  authMiddleware,
  kundliController.getAshtakvargaCharts,
);
router.get("/kundli/charts", authMiddleware, kundliController.getCharts);
router.get("/kundli/dasha", authMiddleware, kundliController.getDasha);
router.get(
  "/kundli/ascendant-report",
  authKundliMiddleware,
  kundliController.getAscendantReport,
);
router.get(
  "/kundli/complete-kundli",
  authKundliMiddleware,
  kundliController.getFullKundliData,
);
router.get(
  "/monthly-choghadiya",
  authMiddleware,
  kundliController.getMonthlyChoghadiya,
);
router.get("/choghadiya", authMiddleware, kundliController.getChoghadiya);
router.get(
  "/full-numerology",
  authKundliMiddleware,
  kundliController.getFullNumerology,
);
router.get(
  "/search-coordinates",
  authMiddleware,
  kundliController.searchCoordinates,
);

// Panchanga extra
router.post(
  "/schedule-tithi",
  authMiddleware,
  panchangaController.scheduleTithi,
);

router.get("/fetch-tithi", authMiddleware, panchangaController.fetchTithi);

//new
router.get("/dosha", authMiddleware, transitDoshaController.getDosha);
router.get(
  "/transit-planets",
  authMiddleware,
  transitDoshaController.getTransitPlanets,
);

router.get("/session", authMiddleware, tarotController.createTarotSession);
router.post("/reveal", authMiddleware, tarotController.revealTarotCard);
// The astrologer app calls reveal with GET and ?cardName=
router.get("/reveal", authMiddleware, tarotController.revealTarotCard);
router.get("/tarot/one-card", authMiddleware, tarotController.oneCardTarot);
router.get("/tarot/three-card", authMiddleware, tarotController.threeCardTarot);

router.get("/search-location", kundliController.searchLocation);
router.get("/search-coordinates", kundliController.searchCoordinates);
router.get("/suggestions", kundliController.getSuggestions);
router.get("/laal-kitaab", authMiddleware, laalKitaabController.getLaalKitaab);
module.exports = router;
