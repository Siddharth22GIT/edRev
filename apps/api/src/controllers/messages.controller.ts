import type { Request, Response } from "express";
import type { MessageAudience, MessageDraft, Tier } from "@edurev/types";
import {
  getConversationService,
  listInboxService,
  markReadService,
  previewAudienceService,
  replyService,
  sendMessageService,
  unreadCountService,
  withdrawService,
} from "../services/messages.service.js";
import { consume } from "../utils/rate-limit.js";

const errorResponse = (res: Response, message: string, status = 400) => res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string => (Array.isArray(param) ? param[0] : param || "");

const MAX_BODY = 2000;
const sendLimit = () => Number(process.env.MESSAGE_SEND_RATE_LIMIT ?? 10);
const replyLimit = () => Number(process.env.MESSAGE_REPLY_RATE_LIMIT ?? 20);

function parseAudience(value: any): MessageAudience | null {
  if (!value || typeof value !== "object" || !["STUDENTS", "ALL_STUDENTS", "TIER", "PROGRAM"].includes(value.type)) return null;
  const strings = (list: unknown) => (Array.isArray(list) && list.every((x) => typeof x === "string") ? (list as string[]) : undefined);
  const audience: MessageAudience = { type: value.type };
  if (value.studentIds !== undefined) {
    const ids = strings(value.studentIds);
    if (!ids) return null;
    audience.studentIds = ids;
  }
  if (value.tiers !== undefined) {
    const tiers = strings(value.tiers);
    if (!tiers) return null;
    audience.tiers = tiers as Tier[];
  }
  if (value.programs !== undefined) {
    const programs = strings(value.programs);
    if (!programs) return null;
    audience.programs = programs;
  }
  if (value.years !== undefined) {
    if (!Array.isArray(value.years) || !value.years.every((y: unknown) => Number.isInteger(y))) return null;
    audience.years = value.years;
  }
  return audience;
}

function handle(res: Response, err: any, fallback: string) {
  errorResponse(res, err.message || fallback, err.statusCode || 500);
}

export async function listInboxHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json({ data: await listInboxService(req.user!) });
  } catch (err: any) {
    handle(res, err, "Failed to load messages.");
  }
}

export async function unreadCountHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json({ data: { count: await unreadCountService(req.user!) } });
  } catch (err: any) {
    handle(res, err, "Failed to count unread messages.");
  }
}

export async function audiencePreviewHandler(req: Request, res: Response): Promise<void> {
  const audience = parseAudience(req.body?.audience);
  if (!audience) return void errorResponse(res, "Choose who should receive this message.");
  try {
    res.json({ data: await previewAudienceService(req.user!, audience) });
  } catch (err: any) {
    handle(res, err, "Failed to preview the audience.");
  }
}

/** Staff with MESSAGE_SEND start a message (students never can; the route enforces the permission). */
export async function sendMessageHandler(req: Request, res: Response): Promise<void> {
  const body = req.body ?? {};
  const audience = parseAudience(body.audience);
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";

  if (!audience) return void errorResponse(res, "Choose who should receive this message.");
  if (subject.length < 3 || subject.length > 120) return void errorResponse(res, "Subject must be 3 to 120 characters.");
  if (text.length < 1 || text.length > MAX_BODY) return void errorResponse(res, `Message must be 1 to ${MAX_BODY} characters.`);
  if (body.priority !== undefined && !["NORMAL", "IMPORTANT"].includes(body.priority)) return void errorResponse(res, "Priority must be NORMAL or IMPORTANT.");
  if (body.allowReplies !== undefined && typeof body.allowReplies !== "boolean") return void errorResponse(res, "allowReplies must be true or false.");
  if (!consume(`message-send:${req.user!.id}`, sendLimit(), 60 * 1000)) return void errorResponse(res, "You're sending messages too quickly. Please wait a minute.", 429);

  const draft: MessageDraft = { audience, subject, body: text, priority: body.priority ?? "NORMAL", allowReplies: body.allowReplies ?? true };
  try {
    const data = await sendMessageService(req.user!, draft);
    res.status(201).json({ data, message: data.length === 1 ? "Message sent." : `Sent to ${data.length} students as private messages.` });
  } catch (err: any) {
    handle(res, err, "Failed to send the message.");
  }
}

export async function getConversationHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json({ data: await getConversationService(req.user!, getParam(req.params.id)) });
  } catch (err: any) {
    handle(res, err, "Failed to load the conversation.");
  }
}

export async function markReadHandler(req: Request, res: Response): Promise<void> {
  try {
    await markReadService(req.user!, getParam(req.params.id));
    res.json({ message: "Marked as read." });
  } catch (err: any) {
    handle(res, err, "Failed to mark as read.");
  }
}

export async function replyHandler(req: Request, res: Response): Promise<void> {
  const text = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (text.length < 1 || text.length > MAX_BODY) return void errorResponse(res, `Reply must be 1 to ${MAX_BODY} characters.`);
  if (!consume(`message-reply:${req.user!.id}`, replyLimit(), 60 * 1000)) return void errorResponse(res, "You're replying too quickly. Please wait a minute.", 429);
  try {
    res.status(201).json({ data: await replyService(req.user!, getParam(req.params.id), text) });
  } catch (err: any) {
    handle(res, err, "Failed to send the reply.");
  }
}

export async function withdrawHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json({ data: await withdrawService(req.user!, getParam(req.params.id)), message: "Message withdrawn." });
  } catch (err: any) {
    handle(res, err, "Failed to withdraw the message.");
  }
}
