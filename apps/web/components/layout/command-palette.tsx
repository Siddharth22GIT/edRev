"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Opportunity, Student } from "@edurev/types";
import { IconArrowRight, IconBriefcase, IconPlus, IconSearch, IconSettings, IconStudents, IconUser } from "@/components/ui/icons";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { navigationFor, settingsLinksFor } from "@/lib/navigation";
import { quickActionsFor, runQuickAction } from "@/lib/quick-actions";

interface Entry {
  id: string;
  group: "Actions" | "Pages" | "Students" | "Opportunities";
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

/**
 * Ctrl/⌘ + K command bar: jump to any page, student or opportunity, or start an action
 * (only the ones the signed-in role is allowed to do).
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [students, setStudents] = useState<Student[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load searchable records the first time the palette opens (the API already scopes them to the role)
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
    if (loaded) return;
    setLoaded(true);
    const read = async <T,>(path: string): Promise<T[]> => {
      try {
        const res = await apiFetch(path);
        if (!res.ok) return [];
        const json = await res.json();
        return Array.isArray(json?.data) ? json.data : [];
      } catch {
        return [];
      }
    };
    read<Student>("/students").then(setStudents);
    read<Opportunity>("/opportunities").then(setOpportunities);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = (href: string) => () => router.push(href);

  const entries = useMemo<Entry[]>(() => {
    const role = user?.role;
    return [
      ...quickActionsFor(role).map<Entry>((action) => ({
        id: `action-${action.id}`,
        group: "Actions",
        label: action.label,
        hint: action.hint,
        icon: <IconPlus size={16} />,
        run: () => runQuickAction(action, pathname, router.push),
      })),
      ...navigationFor(role).map<Entry>((item) => ({
        id: `page-${item.href}`,
        group: "Pages",
        label: item.label,
        icon: <item.icon size={16} />,
        run: go(item.href),
      })),
      { id: "page-/profile", group: "Pages", label: "My profile", hint: "Photo, skills and details", icon: <IconUser size={16} />, run: go("/profile") },
      ...settingsLinksFor(role).map<Entry>((link) => ({
        id: `page-${link.href}`,
        group: "Pages",
        label: link.label,
        icon: <IconSettings size={16} />,
        run: go(link.href),
      })),
      ...students.map<Entry>((s) => ({
        id: `student-${s.id}`,
        group: "Students",
        label: s.name,
        hint: `${s.program} · ${s.tier.replace("_", " ")}`,
        icon: <IconStudents size={16} />,
        run: go(`/students/${s.id}`),
      })),
      ...opportunities.map<Entry>((o) => ({
        id: `opp-${o.id}`,
        group: "Opportunities",
        label: o.project,
        hint: `${o.company} · ${o.status.replace("_", " ").toLowerCase()}`,
        icon: <IconBriefcase size={16} />,
        run: go(`/opportunities/${o.id}`),
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, students, opportunities, pathname]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? entries.filter((e) => `${e.label} ${e.hint ?? ""}`.toLowerCase().includes(q)) : entries.filter((e) => e.group === "Actions" || e.group === "Pages");
    return matched.slice(0, 12);
  }, [entries, query]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    entry.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-[#30343B]/50 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        aria-label="Command bar"
        aria-modal="true"
        className="rise-in w-full max-w-xl overflow-hidden rounded-2xl border border-[#E6E6E6] bg-white shadow-dropdown"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center gap-3 border-b border-[#E6E6E6] px-4">
          <IconSearch className="text-[#8C93A0]" size={18} />
          <input
            aria-label="Search pages, students, opportunities and actions"
            className="h-14 flex-1 bg-transparent text-sm text-[#30343B] outline-none placeholder:text-[#8C93A0]"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or type a command…"
            ref={inputRef}
            value={query}
          />
          <kbd className="rounded-md border border-[#E6E6E6] bg-[#F7F7F6] px-1.5 py-0.5 text-[10px] font-bold text-[#8C93A0]">ESC</kbd>
        </div>

        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-[#8C93A0]">No matches for “{query}”.</li>}
          {results.map((entry, i) => {
            const header = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            return (
              <li key={entry.id}>
                {header && <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-[#8C93A0]">{header}</p>}
                <button
                  aria-selected={i === active}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${i === active ? "bg-[#FEF6EE]" : "hover:bg-[#F7F7F6]"}`}
                  onClick={() => choose(entry)}
                  onMouseEnter={() => setActive(i)}
                  role="option"
                  type="button"
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${i === active ? "bg-[#F2A65A] text-white" : "bg-[#F7F7F6] text-[#3978B8]"}`}>
                    {entry.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[#30343B]">{entry.label}</span>
                    {entry.hint && <span className="block truncate text-xs text-[#666D7A]">{entry.hint}</span>}
                  </span>
                  {i === active && <IconArrowRight className="text-[#C27803]" size={16} />}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-4 border-t border-[#E6E6E6] bg-[#F7F7F6] px-4 py-2 text-[11px] font-semibold text-[#8C93A0]">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span className="ml-auto">Ctrl K anywhere</span>
        </div>
      </div>
    </div>
  );
}
