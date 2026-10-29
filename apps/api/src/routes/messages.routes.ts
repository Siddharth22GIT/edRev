import { Router } from "express";
import {
  audiencePreviewHandler,
  getConversationHandler,
  listInboxHandler,
  markReadHandler,
  replyHandler,
  sendMessageHandler,
  unreadCountHandler,
  withdrawHandler,
} from "../controllers/messages.controller.js";
import { authenticate, requirePermission } from "../middleware/auth.middleware.js";
import { limitPerUser } from "../middleware/security.middleware.js";

// S9: per-user write limits, shared by new messages and replies (env RATE_LIMIT_MESSAGES overrides)
const messageLimit = limitPerUser("messages", 60, 10 * 60 * 1000);

const router = Router();

// Everyone signed in has an inbox; what each person sees is scoped in the service
router.get("/", authenticate, listInboxHandler);
router.get("/unread-count", authenticate, unreadCountHandler);
// Only MESSAGE_SEND roles start messages (students can only reply)
router.post("/", authenticate, requirePermission("MESSAGE_SEND"), messageLimit, sendMessageHandler);
router.post("/audience-preview", authenticate, requirePermission("MESSAGE_SEND"), audiencePreviewHandler);
router.get("/:id", authenticate, getConversationHandler);
router.post("/:id/read", authenticate, markReadHandler);
router.post("/:id/replies", authenticate, messageLimit, replyHandler);
router.post("/:id/withdraw", authenticate, withdrawHandler);

export default router;
