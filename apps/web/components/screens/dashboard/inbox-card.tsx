import type { ReactNode } from "react";
import type { InboxItem } from "@edurev/types";
import { TabCard } from "@/components/ui/tab-card";
import { IconMegaphone, IconMessage } from "@/components/ui/icons";
import { timeAgo } from "@/lib/format";
import type { Resource } from "@/lib/use-resource";
import { CardList, CardRow } from "./card-parts";

/**
 * U8 / U9: private threads ("Messages") or announcements, newest first, with unread marked by a "New" label
 * (not colour alone). Senders see how many recipients have read an announcement; never who.
 */
export function InboxCard({ inbox, kind, viewer, action }: { inbox: Resource<InboxItem[]>; kind: "DIRECT" | "ANNOUNCEMENT"; viewer: "student" | "staff"; action?: ReactNode }) {
  const items = (inbox.data ?? [])
    .filter((i) => i.conversation.kind === kind && !i.conversation.withdrawnAt)
    .sort((a, b) => b.conversation.lastMessageAt.localeCompare(a.conversation.lastMessageAt));
  const unread = items.filter((i) => i.unread).length;
  const isAnnouncements = kind === "ANNOUNCEMENT";

  return (
    <TabCard
      action={action}
      count={unread}
      empty={items.length === 0}
      emptyText={
        isAnnouncements
          ? viewer === "staff"
            ? "No announcements yet."
            : "No announcements yet. News for your tier or program shows up here."
          : viewer === "staff"
            ? "No conversations yet."
            : "No messages yet. Staff messages and your replies show up here."
      }
      error={inbox.error}
      href={isAnnouncements ? "/messages?filter=announcements" : "/messages?filter=direct"}
      icon={isAnnouncements ? <IconMegaphone size={13} /> : <IconMessage size={13} />}
      loading={inbox.loading}
      onRetry={inbox.retry}
      title={isAnnouncements ? "Announcements" : viewer === "staff" ? "My messages" : "Messages"}
      viewAllLabel={isAnnouncements ? "All announcements" : "Open messages"}
    >
      <CardList>
        {items.slice(0, 4).map((i) => {
          const c = i.conversation;
          const staffThread = viewer === "staff" && kind === "DIRECT";
          return (
            <CardRow
              aside={
                <span className="flex flex-col items-end gap-1">
                  <span className="nums text-brand-text-muted">{timeAgo(c.lastMessageAt)}</span>
                  {c.priority === "IMPORTANT" && (
                    <span className="rounded bg-rose-50 px-1.5 text-[10px] font-bold uppercase text-rose-800 ring-1 ring-rose-200">Important</span>
                  )}
                </span>
              }
              href={`/messages?c=${c.id}`}
              key={c.id}
              meta={
                isAnnouncements && i.isSender && i.readCount !== undefined ? (
                  <>
                    <span className="nums">
                      {i.readCount} of {c.recipientCount}
                    </span>{" "}
                    read{c.audienceLabel ? ` · ${c.audienceLabel}` : ""}
                  </>
                ) : staffThread ? (
                  <>
                    {c.subject} · {c.lastMessagePreview}
                  </>
                ) : (
                  <>
                    {c.staff.name} · {c.lastMessagePreview}
                  </>
                )
              }
              title={staffThread ? c.studentName || c.subject : c.subject}
              unread={i.unread}
            />
          );
        })}
      </CardList>
    </TabCard>
  );
}
