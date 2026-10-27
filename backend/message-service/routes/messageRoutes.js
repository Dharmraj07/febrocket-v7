const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/requireAuth");
const messageController = require("../controllers/messageController");

// Every messaging route requires verified authentication.
router.use(requireAuth());

router.get(
  "/unread-count",
  messageController.getUnreadCount
);

router.post(
  "/conversations",
  messageController.createConversation
);

router.get(
  "/conversations",
  messageController.listConversations
);

router.get(
  "/conversations/:conversationId/messages",
  messageController.listMessages
);

router.post(
  "/conversations/:conversationId/messages",
  messageController.sendMessage
);

router.patch(
  "/conversations/:conversationId/read",
  messageController.markConversationRead
);

module.exports = router;