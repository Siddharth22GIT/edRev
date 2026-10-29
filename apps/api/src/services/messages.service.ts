import { can, TIER_ORDER, type ChatMessage, type Conversation, type InboxItem, type MessageAudience, type MessageDraft, type MessageParty, type Student, type Tier, type User } from "@edurev/types";
import { isDbConnected } from "../config/db.js";
import { ChatMessageModel, ConversationModel, ReadStateModel, type ConversationDocument, type ReadStateDocument } from "../models/index.js";
import { getStudentsService } from "./student.service.js";

type Actor = Omit<User, "passwordHash">;

// Demo data mode keeps messages in memory (they reset on restart, like all mock data)
const mem = { conversations: [] as ConversationDocument[], messages: [] as ChatMessage[], reads: [] as ReadStateDocument[] };

const MAX_SELECTED_STUDENTS = 50;

function httpError(message: string, statusCode: number) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const isStudent = (user: Actor) => user.role === "STUDENT";

/** Read state and unread logic key off the student record for students and the account for staff. */
function readerKeyOf(user: Actor): string {
  return isStudent(user) ? user.studentId || user.id : user.id;
}

function partyOf(user: Actor): MessageParty {
  return { userId: user.id, name: user.name, role: user.role };
}

function strip<T>(doc: any): T {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return rest as T;
}

/* ---------------- storage (MongoDB or memory) ---------------- */

async function findConversation(id: string): Promise<ConversationDocument | null> {
  if (isDbConnected()) return strip<ConversationDocument>(await ConversationModel.findOne({ id }).lean());
  return mem.conversations.find((c) => c.id === id) ?? null;
}

async function saveConversation(doc: ConversationDocument): Promise<void> {
  if (isDbConnected()) {
    await ConversationModel.create(doc);
    return;
  }
  mem.conversations.push(doc);
}

async function updateConversation(id: string, changes: Partial<ConversationDocument>): Promise<void> {
  if (isDbConnected()) {
    await ConversationModel.updateOne({ id }, { $set: changes });
    return;
  }
  const doc = mem.conversations.find((c) => c.id === id);
  if (doc) Object.assign(doc, changes);
}

async function insertMessage(message: ChatMessage): Promise<void> {
  if (isDbConnected()) {
    await ChatMessageModel.create(message);
    return;
  }
  mem.messages.push(message);
}

async function messagesOf(conversationId: string): Promise<ChatMessage[]> {
  if (isDbConnected()) {
    const list = await ChatMessageModel.find({ conversationId }).sort({ createdAt: 1 }).lean();
    return list.map((m) => strip<ChatMessage>(m));
  }
  return mem.messages.filter((m) => m.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function markRead(conversationId: string, readerKey: string, at = new Date().toISOString()): Promise<void> {
  if (isDbConnected()) {
    await ReadStateModel.updateOne({ conversationId, readerKey }, { $set: { lastReadAt: at } }, { upsert: true });
    return;
  }
  const state = mem.reads.find((r) => r.conversationId === conversationId && r.readerKey === readerKey);
  if (state) state.lastReadAt = at;
  else mem.reads.push({ conversationId, readerKey, lastReadAt: at });
}

async function readStatesFor(conversationIds: string[]): Promise<ReadStateDocument[]> {
  if (conversationIds.length === 0) return [];
  if (isDbConnected()) return (await ReadStateModel.find({ conversationId: { $in: conversationIds } }).lean()).map((r) => strip<ReadStateDocument>(r));
  return mem.reads.filter((r) => conversationIds.includes(r.conversationId));
}

/** Conversations a user can see: a student's own (not withdrawn); a staff member's own. */
async function visibleConversations(user: Actor): Promise<ConversationDocument[]> {
  if (isStudent(user)) {
    const sid = readerKeyOf(user);
    if (isDbConnected()) {
      const list = await ConversationModel.find({ recipientStudentIds: sid, withdrawnAt: { $exists: false } }).sort({ lastMessageAt: -1 }).lean();
      return list.map((c) => strip<ConversationDocument>(c));
    }
    return mem.conversations.filter((c) => c.recipientStudentIds.includes(sid) && !c.withdrawnAt).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }
  if (isDbConnected()) {
    const list = await ConversationModel.find({ "staff.userId": user.id }).sort({ lastMessageAt: -1 }).lean();
    return list.map((c) => strip<ConversationDocument>(c));
  }
  return mem.conversations.filter((c) => c.staff.userId === user.id).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/** Throws 404 (not 403) for conversations the user may not see, so ids can't be probed. */
async function accessibleConversation(user: Actor, id: string): Promise<ConversationDocument> {
  const doc = await findConversation(id);
  const allowed =
    doc &&
    (isStudent(user) ? doc.recipientStudentIds.includes(readerKeyOf(user)) && !doc.withdrawnAt : doc.staff.userId === user.id);
  if (!doc || !allowed) throw httpError("Conversation not found.", 404);
  return doc;
}

/* ---------------- presentation ---------------- */

/** Students never see who else received an announcement or how many. */
function present(doc: ConversationDocument, user: Actor): Conversation {
  const { recipientStudentIds, lastSenderKey, withdrawnBy, ...conversation } = doc;
  if (isStudent(user)) {
    return { ...conversation, audienceLabel: undefined, recipientCount: doc.kind === "DIRECT" ? 1 : 0 };
  }
  return conversation;
}

function toInboxItem(doc: ConversationDocument, user: Actor, reads: ReadStateDocument[]): InboxItem {
  const key = readerKeyOf(user);
  const mine = reads.find((r) => r.conversationId === doc.id && r.readerKey === key);
  const unread = doc.lastSenderKey !== key && (!mine || mine.lastReadAt < doc.lastMessageAt);
  const isSender = !isStudent(user) && doc.staff.userId === user.id;
  const item: InboxItem = {
    conversation: present(doc, user),
    unread,
    isSender,
    canReply: !doc.withdrawnAt && (isSender || (isStudent(user) && doc.allowReplies)),
  };
  if (isSender) item.readCount = reads.filter((r) => r.conversationId === doc.id && r.readerKey !== key).length;
  return item;
}

/* ---------------- audience ---------------- */

function audienceLabel(audience: MessageAudience, students: Student[]): string {
  switch (audience.type) {
    case "ALL_STUDENTS":
      return "All students";
    case "TIER":
      return (audience.tiers ?? []).map((t) => t.replace("_", " ")).join(", ");
    case "PROGRAM": {
      const years = audience.years?.length ? ` · Year ${audience.years.join(", ")}` : "";
      return `${(audience.programs ?? []).join(", ")}${years}`;
    }
    default:
      return students.map((s) => s.name).join(", ");
  }
}

/** Resolves an audience to active students, enforcing who may send to "all students". */
export async function resolveAudience(user: Actor, audience: MessageAudience): Promise<{ students: Student[]; label: string }> {
  const all = (await getStudentsService()).filter((s) => s.status === "ACTIVE");
  let students: Student[];

  switch (audience.type) {
    case "STUDENTS": {
      const ids = Array.from(new Set(audience.studentIds ?? []));
      if (ids.length === 0) throw httpError("Choose at least one student.", 400);
      if (ids.length > MAX_SELECTED_STUDENTS) throw httpError(`Choose at most ${MAX_SELECTED_STUDENTS} students, or send an announcement to a group.`, 400);
      students = all.filter((s) => ids.includes(s.id));
      if (students.length !== ids.length) throw httpError("Some selected students were not found or are inactive.", 400);
      break;
    }
    case "ALL_STUDENTS":
      if (!can(user.role, "MESSAGE_BROADCAST_ALL")) throw httpError("Only a Cell Coordinator or Administrator can message all students.", 403);
      students = all;
      break;
    case "TIER": {
      const tiers = audience.tiers ?? [];
      if (tiers.length === 0 || tiers.some((t) => !TIER_ORDER.includes(t as Tier))) throw httpError("Choose one or more valid tiers.", 400);
      students = all.filter((s) => tiers.includes(s.tier));
      break;
    }
    case "PROGRAM": {
      const programs = audience.programs ?? [];
      const years = audience.years ?? [];
      if (programs.length === 0) throw httpError("Choose at least one program.", 400);
      if (years.some((y) => !Number.isInteger(y) || y < 1 || y > 6)) throw httpError("Years must be between 1 and 6.", 400);
      students = all.filter((s) => programs.includes(s.program) && (years.length === 0 || years.includes(s.year)));
      break;
    }
    default:
      throw httpError("Unknown audience type.", 400);
  }

  if (students.length === 0) throw httpError("No active students match this audience.", 400);
  return { students, label: audienceLabel(audience, students) };
}

/* ---------------- operations ---------------- */

function preview(body: string) {
  return body.length > 140 ? `${body.slice(0, 137)}…` : body;
}

/**
 * Sends a new message. Selected students each get their own private DIRECT thread; groups get a single
 * ANNOUNCEMENT shared by every recipient (stored once, never duplicated per student).
 */
export async function sendMessageService(user: Actor, draft: MessageDraft): Promise<Conversation[]> {
  const { students, label } = await resolveAudience(user, draft.audience);
  const now = new Date().toISOString();
  const staff = partyOf(user);
  const base = {
    subject: draft.subject,
    priority: draft.priority,
    allowReplies: draft.allowReplies,
    staff,
    createdAt: now,
    lastMessageAt: now,
    lastMessagePreview: preview(draft.body),
    lastSenderKey: readerKeyOf(user),
  };

  const docs: ConversationDocument[] =
    draft.audience.type === "STUDENTS"
      ? students.map((s) => ({ ...base, id: newId("cv"), kind: "DIRECT" as const, studentId: s.id, studentName: s.name, recipientStudentIds: [s.id], recipientCount: 1 }))
      : [{ ...base, id: newId("cv"), kind: "ANNOUNCEMENT" as const, audienceLabel: label, recipientStudentIds: students.map((s) => s.id), recipientCount: students.length }];

  for (const doc of docs) {
    await saveConversation(doc);
    await insertMessage({ id: newId("msg"), conversationId: doc.id, sender: staff, body: draft.body, createdAt: now });
    await markRead(doc.id, readerKeyOf(user), now);
  }
  return docs.map((d) => present(d, user));
}

export async function previewAudienceService(user: Actor, audience: MessageAudience): Promise<{ count: number; label: string }> {
  const { students, label } = await resolveAudience(user, audience);
  return { count: students.length, label };
}

export async function listInboxService(user: Actor): Promise<InboxItem[]> {
  const docs = await visibleConversations(user);
  const reads = await readStatesFor(docs.map((d) => d.id));
  return docs.map((doc) => toInboxItem(doc, user, reads));
}

export async function unreadCountService(user: Actor): Promise<number> {
  return (await listInboxService(user)).filter((item) => item.unread).length;
}

export async function getConversationService(user: Actor, id: string): Promise<{ item: InboxItem; messages: ChatMessage[] }> {
  const doc = await accessibleConversation(user, id);
  const reads = await readStatesFor([doc.id]);
  return { item: toInboxItem(doc, user, reads), messages: await messagesOf(doc.id) };
}

export async function markReadService(user: Actor, id: string): Promise<void> {
  await accessibleConversation(user, id);
  await markRead(id, readerKeyOf(user));
}

async function appendMessage(doc: ConversationDocument, user: Actor, body: string): Promise<ChatMessage> {
  const now = new Date().toISOString();
  const message: ChatMessage = { id: newId("msg"), conversationId: doc.id, sender: partyOf(user), body, createdAt: now };
  await insertMessage(message);
  await updateConversation(doc.id, { lastMessageAt: now, lastMessagePreview: preview(body), lastSenderKey: readerKeyOf(user) });
  await markRead(doc.id, readerKeyOf(user), now);
  return message;
}

/** The private thread a student uses to reply to an announcement (created once, then reused). */
async function privateReplyThread(announcement: ConversationDocument, user: Actor): Promise<ConversationDocument> {
  const sid = readerKeyOf(user);
  const find = async () =>
    isDbConnected()
      ? strip<ConversationDocument>(await ConversationModel.findOne({ parentAnnouncementId: announcement.id, studentId: sid }).lean())
      : mem.conversations.find((c) => c.parentAnnouncementId === announcement.id && c.studentId === sid) ?? null;

  const existing = await find();
  if (existing) return existing;

  const now = new Date().toISOString();
  const doc: ConversationDocument = {
    id: newId("cv"),
    kind: "DIRECT",
    subject: `Re: ${announcement.subject}`,
    priority: "NORMAL",
    allowReplies: true,
    staff: announcement.staff,
    studentId: sid,
    studentName: user.name,
    parentAnnouncementId: announcement.id,
    recipientStudentIds: [sid],
    recipientCount: 1,
    createdAt: now,
    lastMessageAt: now,
    lastMessagePreview: "",
    lastSenderKey: "",
  };
  try {
    await saveConversation(doc);
    return doc;
  } catch (err: any) {
    if (err?.code === 11000) return (await find())!; // a simultaneous reply created it first
    throw err;
  }
}

/**
 * Replies. Students may only reply where replies are allowed; a reply to an announcement goes into a private
 * thread with the sender. Staff may reply in conversations they own (a follow-up on an announcement reaches
 * all of its recipients).
 */
export async function replyService(user: Actor, id: string, body: string): Promise<{ conversationId: string; message: ChatMessage }> {
  const doc = await accessibleConversation(user, id);
  if (doc.withdrawnAt) throw httpError("This conversation was withdrawn.", 409);

  if (isStudent(user)) {
    if (!doc.allowReplies) throw httpError("Replies are turned off for this message.", 403);
    const target = doc.kind === "ANNOUNCEMENT" ? await privateReplyThread(doc, user) : doc;
    return { conversationId: target.id, message: await appendMessage(target, user, body) };
  }

  return { conversationId: doc.id, message: await appendMessage(doc, user, body) };
}

/** The sender (or an Administrator) can withdraw a message; recipients stop seeing it. */
export async function withdrawService(user: Actor, id: string): Promise<Conversation> {
  const doc = await findConversation(id);
  if (!doc || (doc.staff.userId !== user.id && user.role !== "ADMINISTRATOR")) throw httpError("Conversation not found.", 404);
  if (doc.withdrawnAt) throw httpError("This message was already withdrawn.", 409);
  const changes = { withdrawnAt: new Date().toISOString(), withdrawnBy: `${user.role}:${user.id}` };
  await updateConversation(id, changes);
  return present({ ...doc, ...changes }, user);
}

/** Test/cleanup helper: removes conversations whose subject starts with `prefix`, with their messages and read states. */
export async function deleteConversationsBySubjectPrefix(prefix: string): Promise<void> {
  const matches = (subject: string) => subject.startsWith(prefix) || subject.startsWith(`Re: ${prefix}`);
  if (isDbConnected()) {
    const ids = (await ConversationModel.find({}, { id: 1, subject: 1 }).lean<{ id: string; subject: string }[]>()).filter((c) => matches(c.subject)).map((c) => c.id);
    await ChatMessageModel.deleteMany({ conversationId: { $in: ids } });
    await ReadStateModel.deleteMany({ conversationId: { $in: ids } });
    await ConversationModel.deleteMany({ id: { $in: ids } });
    return;
  }
  const ids = mem.conversations.filter((c) => matches(c.subject)).map((c) => c.id);
  mem.conversations = mem.conversations.filter((c) => !ids.includes(c.id));
  mem.messages = mem.messages.filter((m) => !ids.includes(m.conversationId));
  mem.reads = mem.reads.filter((r) => !ids.includes(r.conversationId));
}
