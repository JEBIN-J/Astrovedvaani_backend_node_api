const express = require("express");
const router = express.Router();
const userSupportController = require("../../controller/user/userSupportController");
const authMiddleware = require("../../middlewares/authMiddleware");
// Raise Ticket
router.post(
  "/customer-raise-ticket",
  authMiddleware,
  userSupportController.raiseTicket,
);
router.get(
  "/fetch-my-tickets",
  authMiddleware,
  userSupportController.getMyTickets,
);

router.get(
  "/ticket-by-id",
  authMiddleware,
  userSupportController.getTicketById,
);

module.exports = router;
