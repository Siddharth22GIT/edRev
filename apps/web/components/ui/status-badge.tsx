import { Badge } from "./badge";
import { titleCase } from "@/lib/format";

type BadgeTone = "orange" | "blue" | "green" | "amber" | "red" | "slate" | "violet";

const toneByStatus: Record<string, BadgeTone> = {
  new: "orange",
  open: "orange",
  reviewing: "blue",
  under_review: "blue",
  submitted: "blue",
  shortlisted: "blue",
  allocated: "green",
  accepted: "green",
  verified: "green",
  active: "green",
  healthy: "green",
  closed: "slate",
  paused: "slate",
  draft: "slate",
  pending: "amber",
  "at-risk": "amber",
  attention: "amber",
  rejected: "red",
  declined: "red",
  blocked: "red",
};

export function StatusBadge({ status }: { status: string }) {
  const normalized = (status || "").toLowerCase().replace(/\s+/g, "_");
  return <Badge tone={toneByStatus[normalized] ?? "slate"}>{titleCase(status.replace(/_/g, " "))}</Badge>;
}
