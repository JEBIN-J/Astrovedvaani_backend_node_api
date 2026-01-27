const ticketReplyService = require("../../services/admin/replyTicketService");
const { buildPaginationResponse } = require("../../utils/pagination");

// Admin replies to a ticket
exports.replyToTicket = async (req, res) => {
  try {
    const { ticketId, message, status } = req.body;
    const adminId = req.user._id;
    const role = req.user.role;
    const reply = await ticketReplyService.replyToTicket(
      ticketId,
      adminId,
      role,
      message,
      status,
    );

    return res.status(201).json({
      success: true,
      message: "Reply added successfully.",
      data: reply,
    });
  } catch (error) {
    console.error("Error in replyToTicket Controller:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

exports.getRepliesByTicket = async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 10);

    // ---------------- REPLY FILTER ----------------
    const replyFilter = {};
    if (req.query.ticket_id) replyFilter.ticket_id = req.query.ticket_id;

    if (req.query.sender_role) {
      replyFilter["sender.role"] = Number(req.query.sender_role);
    }

    if (req.query.fromDate && req.query.toDate) {
      replyFilter.replied_at = {
        $gte: new Date(req.query.fromDate),
        $lte: new Date(req.query.toDate),
      };
    }
    const ticketFilter = {};
    if (req.query.ticket_status) ticketFilter.status = req.query.ticket_status;

    if (req.query.ticket_category)
      ticketFilter.category = req.query.ticket_category;

    if (req.query.ticket_priority)
      ticketFilter.priority = req.query.ticket_priority;

    if (req.query.ticket_subject) {
      ticketFilter.subject = {
        $regex: req.query.ticket_subject,
        $options: "i",
      };
    }

    const { replies, total } = await ticketReplyService.getAllReplies({
      page,
      limit,
      replyFilter,
      ticketFilter,
    });

    const summarized = replies.map((reply) => ({
      _id: reply._id,

      ticket: {
        id: reply.ticket_id?._id || null,
        subject: reply.ticket_id?.subject || null,
        status: reply.ticket_id?.status || null,
        category: reply.ticket_id?.category || null,
        priority: reply.ticket_id?.priority || null,
      },

      sender: {
        id: reply.sender?.id?._id || null,
        name: reply.sender?.id?.name || null,
        email: reply.sender?.id?.email || null,
        role: reply.sender?.role,
      },

      message: reply.message,
      attachment_url: reply.attachment_url,
      replied_at: reply.replied_at,
    }));

    return res.status(200).json({
      success: true,
      message: "Replies fetched successfully",
      data: summarized,
      pagination: buildPaginationResponse({
        totalDocs: total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
      }),
    });
  } catch (error) {
    console.error("Error in getRepliesByTicket:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

exports.getAllTicketsForAdmin = async (req, res) => {
  try {
    const { status, priority, category, page = 1, limit = 10 } = req.query;

    const result = await ticketReplyService.getAllTicketsForAdmin({
      status,
      priority,
      category,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    return res.status(200).json({
      success: true,
      message: "All tickets fetched successfully.",
      data: result.tickets,
      pagination: {
        totalDocs: result.totalDocs,
        totalPages: result.totalPages,
        page: result.page,
        limit: result.limit,
      },
    });
  } catch (error) {
    console.error("Error in getAllTicketsForAdmin:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
