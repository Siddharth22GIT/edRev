"use client";

import { useEffect, useState } from "react";
import { can, type AcademicSnapshot } from "@edurev/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";
import { useWorkQueue } from "@/lib/work-queue";

const field =
  "mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm font-semibold text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]";

/**
 * Faculty Director / Administrator: record a student's official CGPA. This is the value safeguards and
 * tier rules use (never the self-reported one). Hidden for every other role; the API enforces it too.
 */
export function AcademicRecordCard({ studentId, current, onSaved }: { studentId: string; current: AcademicSnapshot | null; onSaved: () => void }) {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const { refresh } = useWorkQueue();
  const [cgpa, setCgpa] = useState("");
  const [required, setRequired] = useState("7");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (current) {
      setCgpa(current.cgpa > 0 ? String(current.cgpa) : "");
      setRequired(String(current.requiredCgpa));
    }
  }, [current]);

  if (!can(user?.role, "ACADEMIC_RECORD_MANAGE")) return null;

  const value = Number(cgpa);
  const requiredValue = Number(required);
  const valid = cgpa.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= 10 && Number.isFinite(requiredValue) && requiredValue >= 0 && requiredValue <= 10;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch(`/academic/${studentId}`, { method: "PUT", body: JSON.stringify({ cgpa: value, requiredCgpa: requiredValue }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not save the academic record.");
      toast(
        json.tierReview ? `Official CGPA saved. A ${json.tierReview.suggestedTier.replace("_", " ")} suggestion is waiting for an administrator.` : "Official CGPA saved."
      );
      refresh();
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the academic record.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-[#30343B]">Official academic record</h3>
        {current && <Badge tone={current.cgpaStatus === "ELIGIBLE" ? "green" : "red"}>{current.cgpaStatus === "ELIGIBLE" ? "Eligible" : "Restricted"}</Badge>}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-[#666D7A]">Used by the CGPA safeguard and tier rules. Students can't change it.</p>
      <form className="mt-4 grid grid-cols-2 gap-3" onSubmit={save}>
        <label className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">
          Official CGPA
          <input className={field} inputMode="decimal" max={10} min={0} onChange={(e) => setCgpa(e.target.value)} placeholder="e.g. 8.75" step="0.01" type="number" value={cgpa} />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">
          Required
          <input className={field} inputMode="decimal" max={10} min={0} onChange={(e) => setRequired(e.target.value)} step="0.1" type="number" value={required} />
        </label>
        <Button className="col-span-2" disabled={!valid || saving} type="submit" variant="primary">
          {saving ? "Saving…" : "Save official CGPA"}
        </Button>
      </form>
    </Card>
  );
}
