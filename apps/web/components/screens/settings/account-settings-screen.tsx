"use client";

import { useState } from "react";
import Link from "next/link";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@edurev/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { IconArrowRight, IconShield } from "@/components/ui/icons";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useMyProfile } from "@/lib/my-profile";
import { roleLabels } from "@/lib/navigation";
import { useToast } from "@/lib/toast";

const field =
  "mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-4 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]";

/** Personal settings for every role: account details, password and app preferences. */
export function AccountSettingsScreen() {
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Your account" title="Account Settings" description="Your sign-in, password and personal app preferences." />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <AccountCard />
        <PreferencesCard />
        <PasswordCard />
      </div>
    </div>
  );
}

function AccountCard() {
  const { user } = useAuth();
  const { student } = useMyProfile();
  if (!user) return null;

  return (
    <Card className="p-6">
      <h2 className="font-bold text-[#30343B]">Account</h2>
      <div className="mt-5 flex items-center gap-4">
        <Avatar initials={student?.avatarInitials} name={user.name} photoUrl={student?.photoUrl} size={56} />
        <div className="min-w-0">
          <p className="truncate font-bold text-[#30343B]">{user.name}</p>
          <p className="truncate text-sm text-[#666D7A]">{user.email}</p>
          <div className="mt-1.5">
            <Badge tone="blue">{roleLabels[user.role]}</Badge>
          </div>
        </div>
      </div>
      <p className="mt-5 flex items-start gap-2 rounded-xl bg-[#F7F7F6] p-3 text-xs text-[#666D7A]">
        <IconShield className="mt-0.5 shrink-0 text-[#3978B8]" size={14} />
        Your name, email and role are managed by the institution.
      </p>
      <Link className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#3978B8] hover:underline" href="/profile">
        {user.role === "STUDENT" ? "Edit photo, skills and bio" : "View my profile"} <IconArrowRight size={14} />
      </Link>
    </Card>
  );
}

const preferenceRows: { key: keyof UserPreferences; title: string; description: string }[] = [
  { key: "celebrations", title: "Celebration effects", description: "A short snow burst when a bid is placed, work is allocated or an earning is verified." },
  { key: "reduceMotion", title: "Reduce animations", description: "Turn off page fades, slide-ins and animated charts." },
  { key: "showBadges", title: "Menu count badges", description: "Show how many items are waiting for you next to Earnings, Opportunities and Proposals." },
];

function PreferencesCard() {
  const { user, updateUser } = useAuth();
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const [saving, setSaving] = useState<keyof UserPreferences | null>(null);
  if (!user) return null;
  const prefs: UserPreferences = { ...DEFAULT_USER_PREFERENCES, ...user.preferences };

  const toggle = async (key: keyof UserPreferences) => {
    const next = { ...prefs, [key]: !prefs[key] };
    updateUser({ preferences: next }); // apply immediately
    setSaving(key);
    try {
      const res = await apiFetch("/auth/me/preferences", { method: "PATCH", body: JSON.stringify({ [key]: next[key] }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not save preference.");
      updateUser({ preferences: json.data });
    } catch (err) {
      updateUser({ preferences: prefs }); // roll back
      toast(err instanceof Error ? err.message : "Could not save preference.", "error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="font-bold text-[#30343B]">Preferences</h2>
      <ul className="mt-4 divide-y divide-[#E6E6E6]">
        {preferenceRows.map((row) => (
          <li className="flex items-center justify-between gap-4 py-3.5" key={row.key}>
            <div>
              <p className="text-sm font-bold text-[#30343B]">{row.title}</p>
              <p className="mt-0.5 text-xs text-[#666D7A]">{row.description}</p>
            </div>
            <button
              aria-checked={prefs[row.key]}
              aria-label={row.title}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${prefs[row.key] ? "bg-[#F2A65A]" : "bg-[#D1D5DB]"} disabled:opacity-60`}
              disabled={saving === row.key}
              onClick={() => toggle(row.key)}
              role="switch"
              type="button"
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs[row.key] ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PasswordCard() {
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = [
    { ok: next.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(next) && /\d/.test(next), label: "A letter and a number" },
    { ok: next.length > 0 && next === confirm, label: "Both new passwords match" },
  ];
  const valid = current.length > 0 && rules.every((r) => r.ok);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch("/auth/password", { method: "POST", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not change password.");
      toast("Password changed. Use it next time you sign in.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 lg:col-span-2">
      <h2 className="font-bold text-[#30343B]">Change password</h2>
      <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={submit}>
        <label className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">
          Current password
          <input autoComplete="current-password" className={field} onChange={(e) => setCurrent(e.target.value)} type="password" value={current} />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">
          New password
          <input autoComplete="new-password" className={field} maxLength={128} onChange={(e) => setNext(e.target.value)} type="password" value={next} />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">
          Confirm new password
          <input autoComplete="new-password" className={field} maxLength={128} onChange={(e) => setConfirm(e.target.value)} type="password" value={confirm} />
        </label>

        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs md:col-span-3">
          {rules.map((rule) => (
            <li className={rule.ok ? "font-semibold text-emerald-700" : "text-[#8C93A0]"} key={rule.label}>
              {rule.ok ? "✓" : "○"} {rule.label}
            </li>
          ))}
        </ul>

        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700 md:col-span-3">{error}</p>}

        <div className="md:col-span-3">
          <Button disabled={!valid || saving} type="submit" variant="primary">
            {saving ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
