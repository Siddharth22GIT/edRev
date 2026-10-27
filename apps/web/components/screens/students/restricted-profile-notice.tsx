"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";

export function RestrictedProfileNotice() {
  return (
    <div className="space-y-5">
      <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-[#666D7A] hover:text-[#3978B8] transition" href="/students">
        ← All students
      </Link>
      <Card className="p-8 text-center border-[#E6E6E6] bg-white shadow-card">
        <h2 className="text-lg font-bold text-[#30343B]">Profile Access Restricted</h2>
        <p className="mt-2 text-sm text-[#666D7A]">Students can only view their own readiness profile.</p>
      </Card>
    </div>
  );
}
