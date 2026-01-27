const SupportTicket = require("../../models/SupportTicket");

exports.raiseTicket = async (ticketData, userId, role) => {
  const { subject, description, category, attachmentUrl } = ticketData;

  // Basic validation
  if (!subject || !description) {
    throw new Error("Subject and Description are required.");
  }

  // Create new Ticket
  const newTicket = new SupportTicket({
    raised_by: {
      id: userId,
      role: role,
    },
    subject,
    description,
    category,
    attachmentUrl,
  });

  await newTicket.save();
  return newTicket;
};

exports.getMyTickets = async (
  userId,
  role,
  { status, priority, category, page = 1, limit = 10 },
) => {
  try {
    const skip = (page - 1) * limit;

    // Base query
    const query = {
      "raised_by.id": userId,
      "raised_by.role": role,
    };

    // Apply filters if provided
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
    console.error("Error fetching user tickets:", error);
    throw error;
  }
};

exports.getTicketById = async (ticketId, userId, role) => {
  const ticket = await SupportTicket.findOne({
    _id: ticketId,
    "raised_by.id": userId,
    "raised_by.role": role,
  });

  if (!ticket) {
    throw new Error(
      "Ticket not found or you don't have access to this ticket.",
    );
  }

  return ticket;
};
