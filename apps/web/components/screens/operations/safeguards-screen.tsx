"use client";

import { safeguards } from "@edurev/mock-data";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";
import { IconSafeguards } from "@/components/ui/icons";

export function SafeguardsScreen() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Institutional Governance"
        title="Academic Safeguards & Gates"
        description="A structured framework for student wellbeing, CGPA preservation, hour-caps, and exam blackout enforcement."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        {safeguards.map((safeguard) => (
          <Card className="p-5 flex flex-col justify-between hover:border-[#D1D5DB] transition" key={safeguard.id}>
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FC] text-[#3978B8] border border-[#C2DCF2]">
                    <IconSafeguards size={16} />
                  </span>
                  <h2 className="font-bold text-[#30343B] text-sm">{safeguard.name}</h2>
                </div>
                <StatusBadge status={safeguard.status} />
              </div>
              <p className="mt-3 text-xs leading-5 text-[#666D7A]">{safeguard.description}</p>
            </div>
            <dl className="mt-6 space-y-2 border-t border-[#E6E6E6] pt-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-[#8C93A0] font-semibold">Governance Owner</dt>
                <dd className="font-bold text-[#30343B]">{safeguard.owner}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#8C93A0] font-semibold">Last Checked</dt>
                <dd className="font-semibold text-[#666D7A]">{formatDate(safeguard.lastCheckedAt)}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
      <Card className="p-5 border-[#E6E6E6] bg-[#FEF6EE]/40">
        <h2 className="font-bold text-[#30343B] text-sm">Automated Institutional Policy Gates</h2>
        <p className="mt-1 text-xs leading-5 text-[#666D7A]">
          Work allocations and bid submissions run continuous automated checks against institutional policies: CGPA gates (minimum 7.5 requirement), 20-hour maximum weekly workload caps, and mandatory blackout freeze during midterm and final examination windows.
        </p>
      </Card>
    </div>
  );
}
