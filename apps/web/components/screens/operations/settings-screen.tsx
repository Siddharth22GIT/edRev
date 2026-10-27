"use client";

import { settings } from "@edurev/mock-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export function SettingsScreen() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Administration"
        title="Institutional Settings"
        description="Configure organization defaults, notification email routing, and digest automation preferences."
      />
      <Card className="max-w-3xl p-6">
        <form className="space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="organization-name">
              Organization Name
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white px-3.5 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
              defaultValue={settings.organizationName}
              id="organization-name"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="notification-email">
              Notification Email
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white px-3.5 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
              defaultValue={settings.notificationEmail}
              id="notification-email"
              type="email"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="timezone">
              Institutional Timezone
            </label>
            <select
              className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white px-3.5 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
              defaultValue={settings.timezone}
              id="timezone"
            >
              <option>Asia/Kolkata (IST)</option>
              <option>Europe/London (GMT)</option>
              <option>America/New_York (EST)</option>
            </select>
          </div>
          <label className="flex items-center justify-between rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/50 px-4 py-3 cursor-pointer">
            <span>
              <span className="block text-sm font-bold text-[#30343B]">Weekly Operations Digest</span>
              <span className="mt-0.5 block text-xs text-[#666D7A]">Receive executive operational summary and risk notifications by email.</span>
            </span>
            <input
              className="h-4 w-4 accent-[#F2A65A]"
              defaultChecked={settings.weeklyDigestEnabled}
              type="checkbox"
            />
          </label>
          <div className="pt-2">
            <Button variant="primary" type="button">
              Save Institutional Changes
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
