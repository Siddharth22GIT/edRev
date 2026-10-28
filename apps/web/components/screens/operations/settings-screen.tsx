"use client";

import { useEffect, useState } from "react";
import type { SettingsSummary } from "@edurev/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RequirePermission } from "@/components/ui/require-permission";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { useToast } from "@/lib/toast";

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "UTC", label: "UTC" },
];

const field =
  "mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white px-3.5 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]";

/** Institution-wide settings: administrators only (the API enforces SETTINGS_MANAGE as well). */
export function SettingsScreen() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Administration"
        title="Institutional Settings"
        description="Configure organization defaults, notification email routing, and digest automation preferences."
      />
      <RequirePermission
        action={{ href: "/settings/account", label: "Go to Account settings" }}
        description="Institution-wide settings are managed by your administrator. Your own password and preferences are in Account settings."
        permission="SETTINGS_MANAGE"
        title="Managed by your administrator"
      >
        <InstitutionalSettingsForm />
      </RequirePermission>
    </div>
  );
}

function InstitutionalSettingsForm() {
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const [form, setForm] = useState<SettingsSummary | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setForm(json?.data ?? null))
      .catch(() => setForm(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!form) {
    return (
      <Card className="max-w-3xl space-y-5 p-6">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton className="h-11 w-full" key={i} />
        ))}
      </Card>
    );
  }

  const zones = TIMEZONES.some((z) => z.value === form.timezone) ? TIMEZONES : [{ value: form.timezone, label: form.timezone }, ...TIMEZONES];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch("/settings", {
        method: "PUT",
        body: JSON.stringify({
          organizationName: form.organizationName,
          notificationEmail: form.notificationEmail,
          timezone: form.timezone,
          weeklyDigestEnabled: form.weeklyDigestEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not save settings.");
      setForm(json.data);
      toast("Institutional settings saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save settings.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-3xl p-6">
      <form className="space-y-5" onSubmit={save}>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="organization-name">
            Organization Name
          </label>
          <input
            className={field}
            id="organization-name"
            maxLength={80}
            onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
            required
            value={form.organizationName}
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="notification-email">
            Notification Email
          </label>
          <input
            className={field}
            id="notification-email"
            onChange={(e) => setForm({ ...form, notificationEmail: e.target.value })}
            required
            type="email"
            value={form.notificationEmail}
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="timezone">
            Institutional Timezone
          </label>
          <select className={field} id="timezone" onChange={(e) => setForm({ ...form, timezone: e.target.value })} value={form.timezone}>
            {zones.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/50 px-4 py-3">
          <span>
            <span className="block text-sm font-bold text-[#30343B]">Weekly Operations Digest</span>
            <span className="mt-0.5 block text-xs text-[#666D7A]">Receive executive operational summary and risk notifications by email.</span>
          </span>
          <input
            checked={form.weeklyDigestEnabled}
            className="h-4 w-4 accent-[#F2A65A]"
            onChange={(e) => setForm({ ...form, weeklyDigestEnabled: e.target.checked })}
            type="checkbox"
          />
        </label>
        <div className="pt-2">
          <Button disabled={saving} type="submit" variant="primary">
            {saving ? "Saving…" : "Save Institutional Changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
