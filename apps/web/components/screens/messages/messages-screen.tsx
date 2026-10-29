"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { can, type ChatMessage, type InboxItem } from "@edurev/types";
import { MessageComposer } from "@/components/messages/message-composer";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconMegaphone, IconMessage, IconPlus, IconSearch, IconSend } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate, timeAgo } from "@/lib/format";
import { roleLabels } from "@/lib/navigation";
import { useQuickAction } from "@/lib/quick-actions";
import { useToast } from "@/lib/toast";
import { useWorkQueue } from "@/lib/work-queue";

type Filter = "all" | "unread" | "announcements" | "direct" | "sent";

/** My Messages: inbox on the left, the open conversation on the right (one column on phones). */
export function MessagesScreen() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const { refresh: refreshQueue } = useWorkQueue();
  const canSend = can(user?.role, "MESSAGE_SEND");

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>(() => {
    if (typeof window === "undefined") return "all";
    const requested = new URLSearchParams(window.location.search).get("filter");
    return (["all", "unread", "announcements", "direct", "sent"] as const).find((f) => f === requested) ?? "all";
  });
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ item: InboxItem; messages: ChatMessage[] } | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useQuickAction("new-message", () => {
    if (canSend) setComposerOpen(true);
  });

  const loadInbox = async () => {
    try {
      const res = await apiFetch("/messages");
      if (res.ok) setItems((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  };

  const openConversation = async (id: string) => {
    setOpenId(id);
    window.history.replaceState(null, "", `/messages?c=${id}`);
    const res = await apiFetch(`/messages/${id}`);
    if (!res.ok) {
      setThread(null);
      toast("That conversation isn't available.", "error");
      return;
    }
    setThread((await res.json()).data);
    await apiFetch(`/messages/${id}/read`, { method: "POST" });
    setItems((list) => list.map((i) => (i.conversation.id === id ? { ...i, unread: false } : i)));
    refreshQueue();
  };

  useEffect(() => {
    loadInbox();
    const fromUrl = new URLSearchParams(window.location.search).get("c");
    if (fromUrl) openConversation(fromUrl);
    // Keep the inbox fresh while the page is open
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadInbox();
    }, 30000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const c = i.conversation;
      if (filter === "unread" && !i.unread) return false;
      if (filter === "announcements" && c.kind !== "ANNOUNCEMENT") return false;
      if (filter === "direct" && c.kind !== "DIRECT") return false;
      if (filter === "sent" && !(i.isSender && !c.parentAnnouncementId)) return false;
      return !q || `${c.subject} ${c.lastMessagePreview} ${c.staff.name} ${c.studentName ?? ""}`.toLowerCase().includes(q);
    });
  }, [items, filter, search]);

  const unreadCount = items.filter((i) => i.unread).length;
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: `Unread${unreadCount ? ` (${unreadCount})` : ""}` },
    { id: "announcements", label: "Announcements" },
    { id: "direct", label: "Direct" },
    ...(canSend ? [{ id: "sent" as Filter, label: "Sent" }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          canSend ? (
            <Button onClick={() => setComposerOpen(true)} variant="primary">
              <IconPlus size={16} /> New message
            </Button>
          ) : undefined
        }
        description={canSend ? "Message students individually or send announcements to a tier, program or everyone." : "Messages and announcements from your mentor, cell coordinator and administrators."}
        eyebrow="Inbox"
        title="My Messages"
      />

      <div className="grid gap-4 lg:h-[calc(100vh-15rem)] lg:min-h-[520px] lg:grid-cols-[380px_1fr]">
        {/* LIST */}
        <Card className={`flex min-h-0 flex-col overflow-hidden ${openId ? "hidden lg:flex" : "flex"}`}>
          <div className="space-y-3 border-b border-[#E6E6E6] p-4">
            <label className="relative block">
              <IconSearch className="absolute left-3 top-2.5 text-[#8C93A0]" size={16} />
              <input
                className="w-full rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages"
                value={search}
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {filters.map((f) => (
                <button
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${filter === f.id ? "bg-[#30343B] text-white" : "bg-white text-[#666D7A] ring-1 ring-[#E6E6E6] hover:text-[#30343B]"}`}
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  type="button"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <ul className="min-h-0 flex-1 divide-y divide-[#E6E6E6] overflow-y-auto">
            {loading && <SkeletonRows rows={4} />}
            {!loading && filtered.length === 0 && (
              <li className="px-6 py-12 text-center text-sm text-[#8C93A0]">{items.length === 0 ? "No messages yet." : "Nothing matches this filter."}</li>
            )}
            {filtered.map((item) => (
              <li key={item.conversation.id}>
                <ConversationRow active={openId === item.conversation.id} item={item} onOpen={() => openConversation(item.conversation.id)} viewerIsStudent={user?.role === "STUDENT"} />
              </li>
            ))}
          </ul>
        </Card>

        {/* CONVERSATION */}
        <Card className={`min-h-[420px] flex-col overflow-hidden ${openId ? "flex" : "hidden lg:flex"}`}>
          {thread && openId === thread.item.conversation.id ? (
            <ConversationView
              key={thread.item.conversation.id}
              onBack={() => {
                setOpenId(null);
                setThread(null);
                window.history.replaceState(null, "", "/messages");
              }}
              onChanged={async (nextId) => {
                await loadInbox();
                refreshQueue();
                if (nextId === null) {
                  setOpenId(null);
                  setThread(null);
                } else {
                  await openConversation(nextId);
                }
              }}
              thread={thread}
            />
          ) : (
            <div className="m-auto max-w-sm p-8">
              <EmptyState
                action={
                  canSend ? (
                    <Button onClick={() => setComposerOpen(true)} variant="primary">
                      <IconPlus size={16} /> New message
                    </Button>
                  ) : undefined
                }
                description={canSend ? "Pick a conversation on the left, or start a new one." : "Pick a conversation on the left. Your mentor and coordinators message you here."}
                icon={<IconMessage size={22} />}
                title="Select a conversation"
              />
            </div>
          )}
        </Card>
      </div>

      {composerOpen && (
        <MessageComposer
          onClose={() => setComposerOpen(false)}
          onSent={async (sent) => {
            setComposerOpen(false);
            await loadInbox();
            if (sent.length === 1) await openConversation(sent[0].id);
          }}
        />
      )}
    </div>
  );
}

function ConversationRow({ item, active, onOpen, viewerIsStudent }: { item: InboxItem; active: boolean; onOpen: () => void; viewerIsStudent: boolean }) {
  const c = item.conversation;
  const counterpart = viewerIsStudent ? c.staff.name : c.kind === "ANNOUNCEMENT" ? c.audienceLabel ?? "Announcement" : c.studentName ?? "Student";
  return (
    <button className={`flex w-full gap-3 px-4 py-3.5 text-left transition ${active ? "bg-[#FEF6EE]" : "hover:bg-[#F7F7F6]"}`} onClick={onOpen} type="button">
      {c.kind === "ANNOUNCEMENT" && !viewerIsStudent ? (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#FEF6EE] text-[#C27803] ring-2 ring-[#FBD7B3]">
          <IconMegaphone size={18} />
        </span>
      ) : (
        <Avatar name={counterpart} size={40} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`truncate text-sm ${item.unread ? "font-extrabold text-[#30343B]" : "font-semibold text-[#30343B]"}`}>{c.subject}</span>
          <span className="ml-auto shrink-0 text-[11px] text-[#8C93A0]">{timeAgo(c.lastMessageAt)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          {c.kind === "ANNOUNCEMENT" && <Badge tone="orange">Announcement</Badge>}
          {c.priority === "IMPORTANT" && <Badge tone="red">Important</Badge>}
          {c.withdrawnAt && <Badge tone="slate">Withdrawn</Badge>}
          <span className="truncate text-xs text-[#666D7A]">{counterpart}</span>
        </span>
        <span className={`mt-1 block truncate text-xs ${item.unread ? "font-semibold text-[#30343B]" : "text-[#8C93A0]"}`}>{c.lastMessagePreview}</span>
      </span>
      {item.unread && <span aria-label="Unread" className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#F2A65A]" />}
    </button>
  );
}

function ConversationView({
  thread,
  onBack,
  onChanged,
}: {
  thread: { item: InboxItem; messages: ChatMessage[] };
  onBack: () => void;
  onChanged: (openId: string | null) => Promise<void>;
}) {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { item, messages } = thread;
  const c = item.conversation;
  const isStudent = user?.role === "STUDENT";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await apiFetch(`/messages/${c.id}/replies`, { method: "POST", body: JSON.stringify({ body: text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not send your reply.");
      setReply("");
      if (json.data.conversationId !== c.id) toast(`Sent privately to ${c.staff.name}.`);
      await onChanged(json.data.conversationId);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not send your reply.", "error");
    } finally {
      setSending(false);
    }
  };

  const withdraw = async () => {
    try {
      const res = await apiFetch(`/messages/${c.id}/withdraw`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      toast("Message withdrawn. Recipients no longer see it.", "info");
      await onChanged(c.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not withdraw the message.", "error");
    } finally {
      setConfirmWithdraw(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E6E6E6] px-5 py-4">
        <div className="min-w-0">
          <button className="mb-1 text-xs font-bold text-[#3978B8] lg:hidden" onClick={onBack} type="button">
            ← All messages
          </button>
          <h2 className="truncate text-lg font-extrabold text-[#30343B]">{c.subject}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#666D7A]">
            {c.kind === "ANNOUNCEMENT" ? <Badge tone="orange">Announcement</Badge> : <Badge tone="blue">Direct</Badge>}
            {c.priority === "IMPORTANT" && <Badge tone="red">Important</Badge>}
            {isStudent ? (
              <span>
                From <strong className="text-[#30343B]">{c.staff.name}</strong> · {roleLabels[c.staff.role]}
              </span>
            ) : c.kind === "ANNOUNCEMENT" ? (
              <span>
                To <strong className="text-[#30343B]">{c.audienceLabel}</strong> · {c.recipientCount} student{c.recipientCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span>
                With <strong className="text-[#30343B]">{c.studentName}</strong>
              </span>
            )}
            {item.isSender && item.readCount !== undefined && c.kind === "ANNOUNCEMENT" && (
              <span className="font-semibold text-emerald-700">
                Read by {item.readCount} of {c.recipientCount}
              </span>
            )}
            {c.withdrawnAt && <Badge tone="slate">Withdrawn {formatDate(c.withdrawnAt)}</Badge>}
          </div>
        </div>
        {item.isSender && !c.withdrawnAt && (
          <div className="shrink-0">
            {confirmWithdraw ? (
              <span className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#30343B]">Withdraw for everyone?</span>
                <Button className="text-xs" onClick={() => setConfirmWithdraw(false)} variant="secondary">
                  Cancel
                </Button>
                <Button className="text-xs" onClick={withdraw} variant="destructive">
                  Withdraw
                </Button>
              </span>
            ) : (
              <Button className="text-xs" onClick={() => setConfirmWithdraw(true)} variant="ghost">
                Withdraw
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#F7F7F6]/60 px-5 py-5">
        {messages.map((m) => {
          const mine = m.sender.userId === user?.id || (isStudent && m.sender.role === "STUDENT");
          return (
            <div className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`} key={m.id}>
              <Avatar name={m.sender.name} size={32} />
              <div className={`max-w-[80%] ${mine ? "items-end text-right" : ""} flex flex-col`}>
                <span className="text-[11px] text-[#8C93A0]">
                  <strong className="text-[#30343B]">{mine ? "You" : m.sender.name}</strong> · {roleLabels[m.sender.role]} · {timeAgo(m.createdAt)}
                </span>
                <div
                  className={`mt-1 whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed shadow-sm ${
                    mine ? "rounded-tr-sm bg-[#FEF6EE] text-[#30343B] ring-1 ring-[#FBD7B3]" : "rounded-tl-sm bg-white text-[#30343B] ring-1 ring-[#E6E6E6]"
                  }`}
                >
                  {m.body}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-[#E6E6E6] p-4">
        {item.canReply ? (
          <form className="flex items-end gap-2" onSubmit={send}>
            <div className="flex-1">
              {isStudent && c.kind === "ANNOUNCEMENT" && (
                <p className="mb-1.5 text-[11px] text-[#8C93A0]">Your reply goes privately to {c.staff.name}. Other students won&apos;t see it.</p>
              )}
              <textarea
                aria-label="Write a reply"
                className="max-h-40 w-full resize-y rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-4 py-2.5 text-sm outline-none focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]"
                maxLength={2000}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(e as unknown as React.FormEvent);
                }}
                placeholder={item.isSender && c.kind === "ANNOUNCEMENT" ? "Post a follow-up to all recipients…" : "Write a reply… (Ctrl+Enter to send)"}
                rows={2}
                value={reply}
              />
            </div>
            <Button disabled={sending || !reply.trim()} type="submit" variant="primary">
              <IconSend size={14} /> {sending ? "Sending…" : "Send"}
            </Button>
          </form>
        ) : (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-[#F7F7F6] p-3 text-xs font-semibold text-[#8C93A0]">
            {c.withdrawnAt ? "This message was withdrawn." : "Replies are turned off for this message."}
          </p>
        )}
      </div>
    </>
  );
}
