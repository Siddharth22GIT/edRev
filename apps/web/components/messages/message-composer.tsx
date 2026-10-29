"use client";

import { useEffect, useMemo, useState } from "react";
import { can, TIER_ORDER, type Conversation, type MessageAudience, type Student, type Tier } from "@edurev/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconMegaphone, IconSearch, IconUser, IconX } from "@/components/ui/icons";
import { TierBadge } from "@/components/ui/tier-badge";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";

type Mode = "STUDENTS" | "TIER" | "PROGRAM" | "ALL_STUDENTS";

const field =
  "w-full rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-4 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]";

/** Slide-in panel for staff to message selected students, a tier, a program/year or (Coordinator/Admin) everyone. */
export function MessageComposer({ onClose, onSent }: { onClose: () => void; onSent: (conversations: Conversation[]) => void }) {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const canBroadcast = can(user?.role, "MESSAGE_BROADCAST_ALL");

  const [students, setStudents] = useState<Student[]>([]);
  const [mode, setMode] = useState<Mode>("STUDENTS");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [programs, setPrograms] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [important, setImportant] = useState(false);
  const [allowReplies, setAllowReplies] = useState(true);
  const [reach, setReach] = useState<{ count: number } | { error: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiFetch("/students")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setStudents(Array.isArray(json?.data) ? json.data.filter((s: Student) => s.status === "ACTIVE") : []))
      .catch(() => setStudents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allPrograms = useMemo(() => Array.from(new Set(students.map((s) => s.program))).sort(), [students]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => !selected.includes(s.id) && (!q || `${s.name} ${s.email} ${s.program} ${s.registrationNumber ?? ""}`.toLowerCase().includes(q))).slice(0, 6);
  }, [students, search, selected]);

  const audience: MessageAudience | null =
    mode === "STUDENTS"
      ? selected.length
        ? { type: "STUDENTS", studentIds: selected }
        : null
      : mode === "TIER"
        ? tiers.length
          ? { type: "TIER", tiers }
          : null
        : mode === "PROGRAM"
          ? programs.length
            ? { type: "PROGRAM", programs, years }
            : null
          : { type: "ALL_STUDENTS" };

  // Live "this will reach N students" (debounced)
  const audienceKey = JSON.stringify(audience);
  useEffect(() => {
    if (!audience) {
      setReach(null);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch("/messages/audience-preview", { method: "POST", body: JSON.stringify({ audience }) })
        .then(async (res) => {
          const json = await res.json().catch(() => null);
          setReach(res.ok ? { count: json.data.count } : { error: json?.message || "No students match." });
        })
        .catch(() => setReach(null));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceKey]);

  const valid = Boolean(audience) && reach !== null && "count" in reach && subject.trim().length >= 3 && body.trim().length >= 1;

  const send = async () => {
    if (!audience) return;
    setSending(true);
    try {
      const res = await apiFetch("/messages", {
        method: "POST",
        body: JSON.stringify({ audience, subject: subject.trim(), body: body.trim(), priority: important ? "IMPORTANT" : "NORMAL", allowReplies }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not send the message.");
      toast(json.message || "Message sent.");
      onSent(json.data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not send the message.", "error");
    } finally {
      setSending(false);
    }
  };

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const modes: { id: Mode; label: string }[] = [
    { id: "STUDENTS", label: "Selected students" },
    { id: "TIER", label: "By tier" },
    { id: "PROGRAM", label: "By program" },
    ...(canBroadcast ? [{ id: "ALL_STUDENTS" as Mode, label: "All students" }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 !mt-0 flex justify-end bg-[#30343B]/50 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="drawer-in flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="New message">
        <div className="flex items-center justify-between border-b border-[#E6E6E6] px-6 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#3978B8]">New message</p>
            <h2 className="text-lg font-extrabold text-[#30343B]">Message students</h2>
          </div>
          <button aria-label="Close" className="rounded-lg p-1.5 text-[#666D7A] hover:bg-[#F7F7F6]" onClick={onClose} type="button">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Audience */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">To</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {modes.map((m) => (
                <button
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${mode === m.id ? "bg-[#30343B] text-white" : "bg-white text-[#666D7A] ring-1 ring-[#E6E6E6] hover:ring-[#D1D5DB]"}`}
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  type="button"
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="mt-3">
              {mode === "STUDENTS" && (
                <div>
                  {selected.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {selected.map((id) => {
                        const s = students.find((x) => x.id === id);
                        return (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FC] py-1 pl-1 pr-2 text-xs font-bold text-[#2F659C] ring-1 ring-[#C2DCF2]" key={id}>
                            <Avatar initials={s?.avatarInitials} name={s?.name ?? id} photoUrl={s?.photoUrl} size={20} />
                            {s?.name ?? id}
                            <button aria-label={`Remove ${s?.name ?? id}`} onClick={() => setSelected(selected.filter((x) => x !== id))} type="button">
                              <IconX size={12} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <label className="relative block">
                    <IconSearch className="absolute left-3 top-3 text-[#8C93A0]" size={16} />
                    <input className={`${field} pl-9`} onChange={(e) => setSearch(e.target.value)} placeholder="Search students by name, email or program" value={search} />
                  </label>
                  <ul className="mt-2 divide-y divide-[#E6E6E6] rounded-xl border border-[#E6E6E6]">
                    {matches.length === 0 && <li className="px-4 py-3 text-xs text-[#8C93A0]">No more students match.</li>}
                    {matches.map((s) => (
                      <li key={s.id}>
                        <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[#FEF6EE]" onClick={() => setSelected([...selected, s.id])} type="button">
                          <Avatar initials={s.avatarInitials} name={s.name} photoUrl={s.photoUrl} size={28} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-[#30343B]">{s.name}</span>
                            <span className="block truncate text-xs text-[#666D7A]">{s.program} · Year {s.year}</span>
                          </span>
                          <TierBadge showName={false} tier={s.tier} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {mode === "TIER" && (
                <div className="flex flex-wrap gap-2">
                  {TIER_ORDER.map((tier) => {
                    const on = tiers.includes(tier);
                    return (
                      <button
                        aria-pressed={on}
                        className={`rounded-full p-0.5 transition ${on ? `ring-2 ring-offset-1 ${tier === "TIER_4" ? "ring-[#30343B]" : "ring-[#F2A65A]"}` : "opacity-60 hover:opacity-100"}`}
                        key={tier}
                        onClick={() => setTiers(toggle(tiers, tier))}
                        type="button"
                      >
                        <TierBadge tier={tier} />
                      </button>
                    );
                  })}
                </div>
              )}

              {mode === "PROGRAM" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {allPrograms.map((p) => (
                      <button
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${programs.includes(p) ? "bg-[#3978B8] text-white" : "bg-white text-[#666D7A] ring-1 ring-[#E6E6E6]"}`}
                        key={p}
                        onClick={() => setPrograms(toggle(programs, p))}
                        type="button"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-[#666D7A]">Year (optional):</span>
                    {[1, 2, 3, 4, 5].map((y) => (
                      <button
                        className={`h-7 w-7 rounded-full text-xs font-bold transition ${years.includes(y) ? "bg-[#F2A65A] text-[#30343B]" : "bg-white text-[#666D7A] ring-1 ring-[#E6E6E6]"}`}
                        key={y}
                        onClick={() => setYears(toggle(years, y))}
                        type="button"
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === "ALL_STUDENTS" && (
                <p className="flex items-center gap-2 rounded-xl bg-[#FEF6EE] p-3 text-xs font-semibold text-[#C27803] ring-1 ring-[#FBD7B3]">
                  <IconMegaphone size={16} /> An announcement to every active student.
                </p>
              )}
            </div>

            {reach && (
              <p className={`mt-3 flex items-center gap-1.5 text-xs font-bold ${"count" in reach ? "text-emerald-700" : "text-rose-600"}`}>
                {"count" in reach ? (
                  <>
                    {mode === "STUDENTS" ? <IconUser size={14} /> : <IconMegaphone size={14} />}
                    This will reach {reach.count} student{reach.count === 1 ? "" : "s"}
                    {mode === "STUDENTS" && reach.count > 1 ? " · each gets a private message" : mode !== "STUDENTS" ? " · sent as one announcement" : ""}
                  </>
                ) : (
                  reach.error
                )}
              </p>
            )}
          </div>

          <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]">
            Subject
            <input className={`${field} mt-1.5`} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mid-semester check-in" value={subject} />
          </label>

          <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]">
            Message <span className="normal-case tracking-normal text-[#8C93A0]">({body.length}/2000)</span>
            <textarea className={`${field} mt-1.5`} maxLength={2000} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" rows={7} value={body} />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#E6E6E6] px-4 py-3">
              <span>
                <span className="block text-sm font-bold text-[#30343B]">Important</span>
                <span className="block text-[11px] text-[#666D7A]">Highlighted on students&apos; dashboards</span>
              </span>
              <input checked={important} className="h-4 w-4 accent-[#F2A65A]" onChange={(e) => setImportant(e.target.checked)} type="checkbox" />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#E6E6E6] px-4 py-3">
              <span>
                <span className="block text-sm font-bold text-[#30343B]">Allow replies</span>
                <span className="block text-[11px] text-[#666D7A]">Replies come to you privately</span>
              </span>
              <input checked={allowReplies} className="h-4 w-4 accent-[#F2A65A]" onChange={(e) => setAllowReplies(e.target.checked)} type="checkbox" />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#E6E6E6] px-6 py-4">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button disabled={!valid || sending} onClick={send} variant="primary">
            {sending ? "Sending…" : "Send message"}
          </Button>
        </div>
      </div>
    </div>
  );
}
