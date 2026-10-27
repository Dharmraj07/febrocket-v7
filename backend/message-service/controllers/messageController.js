const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

const getActorId = (req) => req.user?.id || req.user?._id;

const validActor = (req, res) => {
  const id = getActorId(req);

  if (!id || !mongoose.isValidObjectId(id)) {
    res.status(401).json({
      success: false,
      message: "Invalid authenticated user",
    });
    return false;
  }

  if (!["user", "admin"].includes(req.user.role)) {
    res.status(403).json({
      success: false,
      message: "Access denied",
    });
    return false;
  }

  return true;
};

// Find a conversation the current user is allowed to access.
async function findAccessibleConversation(req, res, id) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid conversation ID",
    });
    return null;
  }

  const conversation = await Conversation.findById(id);

  if (!conversation) {
    res.status(404).json({
      success: false,
      message: "Conversation not found",
    });
    return null;
  }

  const isAdmin = req.user.role === "admin";
  const isOwner = conversation.userId.toString() ===
    String(getActorId(req));

  // Hide conversations belonging to other users.
  if (!isAdmin && !isOwner) {
    res.status(404).json({
      success: false,
      message: "Conversation not found",
    });
    return null;
  }

  return conversation;
}

// POST /api/messages/conversations
// A user starts a conversation with an initial message.
exports.createConversation = async (req, res, next) => {
  try {
    if (!validActor(req, res)) return;

    if (req.user.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Only users can start conversations",
      });
    }

    const content =
      typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (!content || content.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid message",
      });
    }

    const conversation = await Conversation.create({
      userId: getActorId(req),
    });

    let message;

    try {
      message = await Message.create({
        conversationId: conversation._id,
        senderId: getActorId(req),
        senderRole: "user",
        content,
      });

      conversation.lastMessageAt = message.createdAt;
      conversation.lastMessagePreview = content.slice(0, 160);
      await conversation.save();
    } catch (error) {
      // Clean up if the initial message could not be saved.
      await Message.deleteMany({
        conversationId: conversation._id,
      });
      await Conversation.deleteOne({ _id: conversation._id });
      throw error;
    }

    return res.status(201).json({
      success: true,
      conversation,
      message,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/messages/conversations
// Users see their conversations; admins see all conversations.
exports.listConversations = async (req, res, next) => {
  try {
    if (!validActor(req, res)) return;

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
    );

    const filter = {};

    if (req.user.role !== "admin") {
      filter.userId = getActorId(req);
    }

    if (req.query.status) {
      if (!["open", "closed"].includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be open or closed",
        });
      }

      filter.status = req.query.status;
    }

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Conversation.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      conversations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/messages/conversations/:conversationId/messages
exports.listMessages = async (req, res, next) => {
  try {
    if (!validActor(req, res)) return;

    const conversation = await findAccessibleConversation(
      req,
      res,
      req.params.conversationId
    );

    if (!conversation) return;

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 50)
    );

    const [newestFirst, total] = await Promise.all([
      Message.find({ conversationId: conversation._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Message.countDocuments({
        conversationId: conversation._id,
      }),
    ]);

    // Return the selected page in chronological order.
    return res.json({
      success: true,
      messages: newestFirst.reverse(),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/messages/conversations/:conversationId/messages
exports.sendMessage = async (req, res, next) => {
  try {
    if (!validActor(req, res)) return;

    const content = req.body.content?.trim();

    if (!content || content.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Message must contain 1–5000 characters",
      });
    }

    const conversation = await findAccessibleConversation(
      req,
      res,
      req.params.conversationId
    );

    if (!conversation) return;

    if (conversation.status === "closed") {
      return res.status(409).json({
        success: false,
        message: "This conversation is closed",
      });
    }

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: getActorId(req),
      senderRole: req.user.role,
      content,
    });

    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessagePreview = content.slice(0, 160);
    await conversation.save();

    return res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/messages/conversations/:conversationId/read
exports.markConversationRead = async (req, res, next) => {
  try {
    if (!validActor(req, res)) return;

    const conversation = await findAccessibleConversation(
      req,
      res,
      req.params.conversationId
    );

    if (!conversation) return;

    const hasMessageIds = Array.isArray(req.body?.messageIds);
    if (req.user.role === "user" && !hasMessageIds) {
      return res.status(400).json({
        success: false,
        message: "Provide the IDs of messages that were seen",
      });
    }

    let readMessageIds;
    const filter = {
      conversationId: conversation._id,
      senderRole: req.user.role === "admin" ? "user" : "admin",
      readAt: null,
    };

    if (hasMessageIds) {
      const requestedIds = [...new Set(req.body.messageIds)];
      if (
        requestedIds.length > 100 ||
        requestedIds.some(
          (id) => typeof id !== "string" || !mongoose.isValidObjectId(id)
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Provide up to 100 valid message IDs",
        });
      }

      const requestedMessages = await Message.find({
        _id: { $in: requestedIds },
        conversationId: conversation._id,
      })
        .select("_id senderRole")
        .lean();

      if (requestedMessages.length !== requestedIds.length) {
        return res.status(400).json({
          success: false,
          message: "Messages must belong to this conversation",
        });
      }

      readMessageIds = requestedMessages
        .filter((message) => message.senderRole !== req.user.role)
        .map((message) => String(message._id));
      filter._id = { $in: readMessageIds };
    }

    const readAt = new Date();
    const result = await Message.updateMany(
      filter,
      {
        $set: { readAt },
      }
    );

    return res.json({
      success: true,
      markedAsRead: result.modifiedCount,
      readAt: readAt.toISOString(),
      ...(readMessageIds ? { readMessageIds } : {}),
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/messages/unread-count
exports.getUnreadCount = async (req, res, next) => {
  try {
    if (!validActor(req, res)) return;

    let filter;

    if (req.user.role === "admin") {
      // Unread messages received from users across all conversations.
      filter = {
        senderRole: "user",
        readAt: null,
      };
    } else {
      const conversations = await Conversation.find({
        userId: getActorId(req),
      })
        .select("_id")
        .lean();

      filter = {
        conversationId: {
          $in: conversations.map((item) => item._id),
        },
        senderRole: "admin",
        readAt: null,
      };
    }

    const count = await Message.countDocuments(filter);

    return res.json({
      success: true,
      unreadCount: count,
    });
  } catch (error) {
    next(error);
  }
};