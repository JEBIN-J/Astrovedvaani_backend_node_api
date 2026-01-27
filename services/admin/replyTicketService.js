const TicketReply = require("../../models/TicketReply");
const SupportTicket = require("../../models/SupportTicket");
const Enums = require("../../utils/constants");

exports.replyToTicket = async (ticketId, adminId, role, message, status) => {
  if (!ticketId || !message) {
    throw new Error("ticket_id and message are required.");
  }
  if (!Object.values(Enums.SUPPORT.TICKET_STATUS).includes(status)) {
    throw new Error("Invalid ticket status");
  }

  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) {
    throw new Error("Ticket not found.");
  }
  if (
    ticket.status === Enums.SUPPORT.TICKET_STATUS.RESOLVED ||
    ticket.status === Enums.SUPPORT.TICKET_STATUS.CLOSED
  ) {
    throw new Error("Ticket is already resolved/closed and cannot be updated.");
  }

  if (status) {
    ticket.status = status;
    await ticket.save();
  }

  const reply = new TicketReply({
    ticket_id: ticketId,
    sender: {
      id: adminId,
      role: role,
    },
    message,
    replied_at: new Date(),
  });

  await reply.save();
  return reply;
};

exports.getAllReplies = async ({
  page = 1,
  limit = 10,
  replyFilter = {},
  ticketFilter = {},
}) => {
  const skip = (page - 1) * limit;

  const replies = await TicketReply.find(replyFilter)
    .select("ticket_id sender message replied_at attachment_url")
    .populate({
      path: "ticket_id",
      select: "subject status category priority",
      match: ticketFilter,
    })
    .populate({
      path: "sender.id",
      select: "name email role",
    })
    .sort({ replied_at: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const filteredReplies = replies.filter((r) => r.ticket_id);

  return {
    replies: filteredReplies,
    total: filteredReplies.length,
  };
};

exports.getAllTicketsForAdmin = async ({
  status,
  priority,
  category,
  page = 1,
  limit = 10,
}) => {
  try {
    const skip = (page - 1) * limit;

    const query = {};

    if (status !== undefined) {
      query.status = parseInt(status);
    }

    if (priority !== undefined) {
      query.priority = parseInt(priority);
    }

    if (category !== undefined) {
      query.category = parseInt(category);
    }

    const [tickets, totalDocs] = await Promise.all([
      SupportTicket.find(query)
        .populate({
          path: "raised_by.id",
          select: "name profilePicture",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(query),
    ]);

    return {
      tickets,
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit,
    };
  } catch (error) {
    console.error("Error fetching admin tickets:", error);
    throw error;
  }
};
