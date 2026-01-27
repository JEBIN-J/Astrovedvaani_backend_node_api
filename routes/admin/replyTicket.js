const express = require("express");
const router = express.Router();
const ticketReplyController = require("../../controller/admin/replyTicketController");

// Admin reply to ticket
router.post("/reply", ticketReplyController.replyToTicket);

router.get("/replies", ticketReplyController.getRepliesByTicket);
router.get("/fetch-all", ticketReplyController.getAllTicketsForAdmin);
module.exports = router;
