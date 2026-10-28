"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { IconCamera, IconChevronDown, IconGraduationCap, IconLogout, IconSettings, IconUser } from "@/components/ui/icons";
import { useAuth } from "@/lib/auth-context";
import { useMyProfile } from "@/lib/my-profile";
import { roleLabels, settingsLinksFor } from "@/lib/navigation";
import { runQuickAction } from "@/lib/quick-actions";

/** Avatar button in the top bar that opens the account menu (profile, photo, skills, settings, log out). */
export function ProfileMenu() {
  const { user, logout } = useAuth();
  const { student } = useMyProfile();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!user) return null;
  const isStudent = user.role === "STUDENT";

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="relative border-l border-[#E6E6E6] pl-3" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition hover:bg-[#F7F7F6]"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Avatar initials={student?.avatarInitials} name={user.name} photoUrl={student?.photoUrl} size={36} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-bold leading-tight text-[#30343B]">{user.name}</span>
          <span className="mt-0.5 block">
            <Badge tone="blue">{roleLabels[user.role]}</Badge>
          </span>
        </span>
        <IconChevronDown className={`hidden text-[#8C93A0] transition sm:block ${open ? "rotate-180" : ""}`} size={16} />
      </button>

      {open && (
        <div className="rise-in absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-2xl border border-[#E6E6E6] bg-white shadow-dropdown" role="menu">
          <div className="flex items-center gap-3 bg-gradient-to-br from-[#30343B] via-[#2B3F58] to-[#204D7D] p-4 text-white">
            <Avatar initials={student?.avatarInitials} name={user.name} photoUrl={student?.photoUrl} size={48} />
            <div className="min-w-0">
              <p className="truncate font-bold">{user.name}</p>
              <p className="truncate text-xs text-[#C2DCF2]">{user.email}</p>
              {isStudent && student && (
                <p className="mt-1 text-xs font-semibold text-[#FBD7B3]">
                  CGPA {student.cgpa.toFixed(2)} · {student.tier.replace("_", " ")}
                </p>
              )}
            </div>
          </div>

          <div className="p-1.5">
            <MenuItem icon={<IconUser size={16} />} label="My profile" onClick={() => go("/profile")} />
            {isStudent && (
              <>
                <MenuItem
                  icon={<IconCamera size={16} />}
                  label={student?.photoUrl ? "Change photo" : "Add a photo"}
                  onClick={() => {
                    setOpen(false);
                    runQuickAction({ id: "change-photo", path: "/profile" }, pathname, router.push);
                  }}
                />
                <MenuItem
                  hint={student ? `${student.skills.length} listed` : undefined}
                  icon={<IconGraduationCap size={16} />}
                  label="My skills"
                  onClick={() => go("/profile?tab=skills")}
                />
              </>
            )}
            {settingsLinksFor(user.role).map((link) => (
              <MenuItem icon={<IconSettings size={16} />} key={link.href} label={link.label} onClick={() => go(link.href)} />
            ))}
          </div>

          <div className="border-t border-[#E6E6E6] p-1.5">
            <MenuItem
              danger
              icon={<IconLogout size={16} />}
              label="Log out"
              onClick={() => {
                setOpen(false);
                logout();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, hint, onClick, danger = false }: { icon: ReactNode; label: string; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${
        danger ? "text-rose-700 hover:bg-rose-50" : "text-[#30343B] hover:bg-[#FEF6EE]"
      }`}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <span className={danger ? "text-rose-600" : "text-[#3978B8]"}>{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-xs text-[#8C93A0]">{hint}</span>}
    </button>
  );
}
