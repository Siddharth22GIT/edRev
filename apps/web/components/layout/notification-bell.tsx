"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { InboxItem } from "@edurev/types";
import { IconBell, IconMegaphone, IconMessage } from "@/components/ui/icons";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { timeAgo } from "@/lib/format";
import { useWorkQueue } from "@/lib/work-queue";

/** Top-bar bell: unread message count and the latest five conversations. */
export function NotificationBell() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const { unreadMessages } = useWorkQueue();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const showBadge = user?.preferences?.showBadges !== false && unreadMessages > 0;

  useEffect(() => {
    if (!open) return;
    apiFetch("/messages")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const list: InboxItem[] = Array.isArray(json?.data) ? json.data : [];
        // Unread first, then newest
        setItems([...list].sort((a, b) => Number(b.unread) - Number(a.unread) || b.conversation.lastMessageAt.localeCompare(a.conversation.lastMessageAt)).slice(0, 5));
      })
      .catch(() => setItems([]));
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        aria-expanded={open}
        aria-label={unreadMessages ? `${unreadMessages} unread messages` : "Messages"}
        className="relative grid h-9 w-9 place-items-center rounded-xl text-[#666D7A] transition hover:bg-[#F7F7F6] hover:text-[#30343B]"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <IconBell size={20} />
        {showBadge && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#F2A65A] px-1 text-[10px] font-extrabold text-[#30343B] ring-2 ring-white">
            {unreadMessages > 9 ? "9+" : unreadMessages}
          </span>
        )}
      </button>

      {open && (
        <div className="rise-in absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-[#E6E6E6] bg-white shadow-dropdown">
          <div className="flex items-center justify-between border-b border-[#E6E6E6] px-4 py-3">
            <p className="text-sm font-bold text-[#30343B]">Messages</p>
            {unreadMessages > 0 && <span className="text-xs font-semibold text-[#C27803]">{unreadMessages} unread</span>}
          </div>
          <ul className="max-h-80 divide-y divide-[#E6E6E6] overflow-y-auto">
            {items === null && <li className="px-4 py-6 text-center text-xs text-[#8C93A0]">Loading…</li>}
            {items?.length === 0 && <li className="px-4 py-6 text-center text-xs text-[#8C93A0]">No messages yet.</li>}
            {items?.map((item) => {
              const c = item.conversation;
              return (
                <li key={c.id}>
                  <button className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-[#FEF6EE]" onClick={() => go(`/messages?c=${c.id}`)} type="button">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${c.kind === "ANNOUNCEMENT" ? "bg-[#FEF6EE] text-[#C27803]" : "bg-[#EFF6FC] text-[#3978B8]"}`}>
                      {c.kind === "ANNOUNCEMENT" ? <IconMegaphone size={16} /> : <IconMessage size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${item.unread ? "font-extrabold" : "font-semibold"} text-[#30343B]`}>{c.subject}</span>
                      <span className="block truncate text-xs text-[#666D7A]">{c.lastMessagePreview}</span>
                      <span className="text-[11px] text-[#8C93A0]">{timeAgo(c.lastMessageAt)}</span>
                    </span>
                    {item.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#F2A65A]" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="w-full border-t border-[#E6E6E6] px-4 py-3 text-center text-sm font-bold text-[#3978B8] hover:bg-[#EFF6FC]" onClick={() => go("/messages")} type="button">
            Open My Messages
          </button>
        </div>
      )}
    </div>
  );
}
