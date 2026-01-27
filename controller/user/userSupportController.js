const supportTicketService = require("../../services/user/userSupportService");

exports.raiseTicket = async (req, res) => {
  try {
    const ticketData = req.body;
    const userId = req.user._id;
    const role = req.user.role;

    const result = await supportTicketService.raiseTicket(
      ticketData,
      userId,
      role,
    );

    return res.status(201).json({
      success: true,
      message: "Customer ticket raised successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Error in raiseTicket Controller:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

exports.getTicketById = async (req, res) => {
  try {
    const ticketId = req.query.id; // ✅ changed from params to query
    const userId = req.user._id;
    const role = req.user.role;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: "Ticket ID is required in query",
      });
    }

    const ticket = await supportTicketService.getTicketById(
      ticketId,
      userId,
      role,
    );

    return res.status(200).json({
      success: true,
      message: "Ticket fetched successfully.",
      data: ticket,
    });
  } catch (error) {
    console.error("Error in getTicketById Controller:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
exports.getMyTickets = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;
    const { status, priority, category, page = 1, limit = 10 } = req.query;

    const result = await supportTicketService.getMyTickets(userId, role, {
      status,
      priority,
      category,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    return res.status(200).json({
      success: true,
      message: "Tickets fetched successfully.",
      data: result.tickets,
      pagination: {
        totalDocs: result.totalDocs,
        totalPages: result.totalPages,
        page: result.page,
        limit: result.limit,
      },
    });
  } catch (error) {
    console.error("Error in getMyTickets Controller:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
