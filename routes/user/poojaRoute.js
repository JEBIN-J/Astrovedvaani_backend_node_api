const express = require("express");
const authMiddleware = require("../../middlewares/authMiddleware");
const poojaController = require("../../controller/user/poojaController");

const router = express.Router();

router.get("/fetch-all", authMiddleware, poojaController.getAllPoojas);
router.get("/fetch-my-booking", authMiddleware, poojaController.getMyBookings);
router.post("/book", authMiddleware, poojaController.bookPooja);
router.put("/update-booking", authMiddleware, poojaController.updatePoojaBooking);
router.get("/pooja-by-id", authMiddleware, poojaController.getPoojaById);
module.exports = router;