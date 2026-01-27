const express = require("express");
const router = express.Router();
const userSupportController = require("../../controller/user/userSupportController");
// Raise Ticket
router.post("/raise-ticket", userSupportController.raiseTicket);
router.get("/fetch-my-tickets", userSupportController.getMyTickets);

router.get("/ticket-by-id", userSupportController.getTicketById);

module.exports = router;
