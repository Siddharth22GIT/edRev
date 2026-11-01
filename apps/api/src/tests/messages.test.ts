import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import type { InboxItem } from "@edurev/types";
import { deleteConversationsBySubjectPrefix } from "../services/messages.service.js";
import { resetRateLimits } from "../utils/rate-limit.js";
import { makeClient, startTestServer, stopTestServer, type TestUserKey } from "./helpers.js";

process.env.MESSAGE_SEND_RATE_LIMIT = "1000";
process.env.MESSAGE_REPLY_RATE_LIMIT = "1000";

const P = "[msg-test]";

describe("Messages Suite", () => {
  let server: Server;
  let baseUrl = "";
  const call = makeClient(() => baseUrl);
  let rohanTier = "TIER_2";

  const inbox = async (as: TestUserKey): Promise<InboxItem[]> => (await call("GET", "/messages", { as })).json.data;
  const mine = async (as: TestUserKey, subject: string) => (await inbox(as)).filter((i) => i.conversation.subject === subject);
  const send = (as: TestUserKey, body: Record<string, unknown>) => call("POST", "/messages", { as, body });
  const draft = (subject: string, audience: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    subject: `${P} ${subject}`,
    body: `Hello from the ${subject} test.`,
    audience,
    ...extra,
  });

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
    resetRateLimits();
    await deleteConversationsBySubjectPrefix(P);
    rohanTier = (await call("GET", "/students/stu-202", { as: "admin" })).json.data.tier;
  });

  after(async () => {
    await deleteConversationsBySubjectPrefix(P);
    resetRateLimits();
    await stopTestServer(server);
  });

  describe("Who can send", () => {
    it("requires authentication", async () => {
      assert.strictEqual((await call("GET", "/messages")).status, 401);
      assert.strictEqual((await call("GET", "/messages/unread-count")).status, 401);
      assert.strictEqual((await call("POST", "/messages", { body: draft("anon", { type: "ALL_STUDENTS" }) })).status, 401);
    });

    it("never lets students or non-messaging staff start a conversation", async () => {
      for (const as of ["studentA", "analyst", "editor", "placement"] as const) {
        assert.strictEqual((await send(as, draft("blocked", { type: "STUDENTS", studentIds: ["stu-201"] }))).status, 403, as);
        assert.strictEqual((await call("POST", "/messages/audience-preview", { as, body: { audience: { type: "ALL_STUDENTS" } } })).status, 403, as);
      }
      // Everyone still has an inbox
      assert.strictEqual((await call("GET", "/messages", { as: "analyst" })).status, 200);
    });

    it("limits 'all students' to Cell Coordinators and Administrators", async () => {
      for (const as of ["guild", "faculty", "dean"] as const) {
        assert.strictEqual((await send(as, draft("all-blocked", { type: "ALL_STUDENTS" }))).status, 403, as);
      }
      const ok = await send("coordinator", draft("All students", { type: "ALL_STUDENTS" }, { allowReplies: false }));
      assert.strictEqual(ok.status, 201);
      assert.strictEqual(ok.json.data[0].kind, "ANNOUNCEMENT");
      assert.strictEqual(ok.json.data[0].audienceLabel, "All students");
    });

    it("validates the message", async () => {
      const bad: [string, Record<string, unknown>][] = [
        ["no audience", { subject: `${P} x`, body: "Hi" }],
        ["short subject", draft("ok", { type: "STUDENTS", studentIds: ["stu-201"] }, { subject: "Hi" })],
        ["empty body", draft("ok", { type: "STUDENTS", studentIds: ["stu-201"] }, { body: "   " })],
        ["long body", draft("ok", { type: "STUDENTS", studentIds: ["stu-201"] }, { body: "x".repeat(2001) })],
        ["priority", draft("ok", { type: "STUDENTS", studentIds: ["stu-201"] }, { priority: "URGENT" })],
        ["allowReplies", draft("ok", { type: "STUDENTS", studentIds: ["stu-201"] }, { allowReplies: "yes" })],
        ["no students", draft("ok", { type: "STUDENTS", studentIds: [] })],
        ["unknown student", draft("ok", { type: "STUDENTS", studentIds: ["stu-does-not-exist"] })],
        ["bad tier", draft("ok", { type: "TIER", tiers: ["TIER_9"] })],
        ["no program", draft("ok", { type: "PROGRAM", programs: [] })],
        ["nobody matches", draft("ok", { type: "PROGRAM", programs: ["Underwater Basket Weaving"] })],
      ];
      for (const [label, body] of bad) assert.strictEqual((await send("admin", body)).status, 400, label);
    });

    it("previews how many students an audience reaches", async () => {
      const res = await call("POST", "/messages/audience-preview", { as: "guild", body: { audience: { type: "TIER", tiers: [rohanTier] } } });
      assert.strictEqual(res.status, 200);
      assert.ok(res.json.data.count >= 1);
    });
  });

  describe("Direct messages", () => {
    const subject = `${P} Direct check-in`;

    it("gives each selected student their own private thread", async () => {
      const res = await send("guild", draft("Direct check-in", { type: "STUDENTS", studentIds: ["stu-202", "stu-201", "stu-202"] }));
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.data.length, 2, "duplicate ids are ignored");
      assert.ok(res.json.data.every((c: { kind: string }) => c.kind === "DIRECT"));

      const rohan = await mine("studentA", subject);
      const maya = await mine("studentB", subject);
      assert.strictEqual(rohan.length, 1);
      assert.strictEqual(maya.length, 1);
      assert.strictEqual(rohan[0].conversation.studentId, "stu-202");
      assert.notStrictEqual(rohan[0].conversation.id, maya[0].conversation.id);

      // A student can never open another student's conversation
      assert.strictEqual((await call("GET", `/messages/${maya[0].conversation.id}`, { as: "studentA" })).status, 404);
      assert.strictEqual((await call("POST", `/messages/${maya[0].conversation.id}/replies`, { as: "studentA", body: { body: "hi" } })).status, 404);
    });

    it("tracks unread messages and read receipts", async () => {
      const [item] = await mine("studentA", subject);
      assert.strictEqual(item.unread, true);
      assert.strictEqual(item.canReply, true);
      assert.ok((await call("GET", "/messages/unread-count", { as: "studentA" })).json.data.count >= 1);

      const opened = await call("GET", `/messages/${item.conversation.id}`, { as: "studentA" });
      assert.strictEqual(opened.json.data.messages.length, 1);
      assert.strictEqual((await call("POST", `/messages/${item.conversation.id}/read`, { as: "studentA" })).status, 200);
      assert.strictEqual((await mine("studentA", subject))[0].unread, false);

      const sent = (await mine("guild", subject)).find((i) => i.conversation.studentId === "stu-202")!;
      assert.strictEqual(sent.isSender, true);
      assert.strictEqual(sent.readCount, 1);
    });

    it("lets the student reply in the same thread, and the sender sees it as unread", async () => {
      const [item] = await mine("studentA", subject);
      const reply = await call("POST", `/messages/${item.conversation.id}/replies`, { as: "studentA", body: { body: "Thanks, all good!" } });
      assert.strictEqual(reply.status, 201);
      assert.strictEqual(reply.json.data.conversationId, item.conversation.id);
      assert.strictEqual(reply.json.data.message.sender.role, "STUDENT");

      const sent = (await mine("guild", subject)).find((i) => i.conversation.studentId === "stu-202")!;
      assert.strictEqual(sent.unread, true);
      assert.strictEqual(sent.conversation.lastMessagePreview, "Thanks, all good!");
    });

    it("blocks replies when the sender turned them off", async () => {
      await send("guild", draft("No replies", { type: "STUDENTS", studentIds: ["stu-202"] }, { allowReplies: false }));
      const [item] = await mine("studentA", `${P} No replies`);
      assert.strictEqual(item.canReply, false);
      assert.strictEqual((await call("POST", `/messages/${item.conversation.id}/replies`, { as: "studentA", body: { body: "hi" } })).status, 403);
    });
  });

  describe("Announcements", () => {
    const subject = `${P} Tier notice`;
    let announcementId = "";

    it("sends one shared announcement and hides the audience from students", async () => {
      const res = await send("faculty", draft("Tier notice", { type: "TIER", tiers: [rohanTier] }, { priority: "IMPORTANT" }));
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.data.length, 1);
      announcementId = res.json.data[0].id;
      assert.ok(res.json.data[0].recipientCount >= 1);

      const [item] = await mine("studentA", subject);
      assert.strictEqual(item.conversation.kind, "ANNOUNCEMENT");
      assert.strictEqual(item.conversation.priority, "IMPORTANT");
      assert.strictEqual(item.conversation.audienceLabel, undefined);
      assert.strictEqual(item.conversation.recipientCount, 0);
    });

    it("turns a student's reply into one private thread with the sender (no duplicates)", async () => {
      const first = await call("POST", `/messages/${announcementId}/replies`, { as: "studentA", body: { body: "Question about this notice" } });
      assert.strictEqual(first.status, 201);
      assert.notStrictEqual(first.json.data.conversationId, announcementId);
      const second = await call("POST", `/messages/${announcementId}/replies`, { as: "studentA", body: { body: "Another question" } });
      assert.strictEqual(second.json.data.conversationId, first.json.data.conversationId, "reuses the same private thread");

      const thread = await call("GET", `/messages/${first.json.data.conversationId}`, { as: "faculty" });
      assert.strictEqual(thread.status, 200);
      assert.strictEqual(thread.json.data.item.conversation.parentAnnouncementId, announcementId);
      assert.strictEqual(thread.json.data.item.conversation.subject, `Re: ${subject}`);
      assert.strictEqual(thread.json.data.messages.length, 2);

      // Nobody else sees Rohan's private reply
      assert.ok((await inbox("studentB")).every((i) => i.conversation.studentId !== "stu-202"));
      assert.ok((await inbox("guild")).every((i) => i.conversation.id !== first.json.data.conversationId));
    });

    it("delivers the sender's follow-up to recipients as a new unread message", async () => {
      await call("POST", `/messages/${announcementId}/read`, { as: "studentA" });
      assert.strictEqual((await call("POST", `/messages/${announcementId}/replies`, { as: "faculty", body: { body: "Update: deadline moved." } })).status, 201);
      const [item] = await mine("studentA", subject);
      assert.strictEqual(item.unread, true);
      assert.strictEqual(item.conversation.lastMessagePreview, "Update: deadline moved.");
    });

    it("lets only the sender or an administrator withdraw a message", async () => {
      assert.strictEqual((await call("POST", `/messages/${announcementId}/withdraw`, { as: "guild" })).status, 404);
      assert.strictEqual((await call("POST", `/messages/${announcementId}/withdraw`, { as: "studentA" })).status, 404);
      assert.strictEqual((await call("POST", `/messages/${announcementId}/withdraw`, { as: "faculty" })).status, 200);
      assert.strictEqual((await call("POST", `/messages/${announcementId}/withdraw`, { as: "faculty" })).status, 409);

      assert.strictEqual((await mine("studentA", subject)).length, 0, "recipients no longer see it");
      assert.strictEqual((await call("GET", `/messages/${announcementId}`, { as: "studentA" })).status, 404);

      const all = (await mine("coordinator", `${P} All students`))[0];
      assert.strictEqual((await call("POST", `/messages/${all.conversation.id}/withdraw`, { as: "admin" })).status, 200, "admin can withdraw anyone's");
    });
  });

  it("rate-limits rapid sending", async () => {
    process.env.MESSAGE_SEND_RATE_LIMIT = "2";
    resetRateLimits();
    try {
      for (let i = 0; i < 2; i++) assert.strictEqual((await send("guild", draft(`Burst ${i}`, { type: "STUDENTS", studentIds: ["stu-202"] }))).status, 201);
      assert.strictEqual((await send("guild", draft("Burst 3", { type: "STUDENTS", studentIds: ["stu-202"] }))).status, 429);
    } finally {
      process.env.MESSAGE_SEND_RATE_LIMIT = "1000";
      resetRateLimits();
    }
  });
});
