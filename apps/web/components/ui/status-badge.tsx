import { Badge } from "./badge";
import { titleCase } from "@/lib/format";

const toneByStatus: Record<string, "blue" | "green" | "amber" | "red" | "slate" | "violet"> = {
  new: "blue",
  reviewing: "violet",
  shortlisted: "green",
  closed: "slate",
  active: "green",
  "at-risk": "amber",
  paused: "slate",
  draft: "slate",
  submitted: "blue",
  accepted: "green",
  declined: "red",
  healthy: "green",
  attention: "amber",
  blocked: "red",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={toneByStatus[status] ?? "slate"}>{titleCase(status)}</Badge>;
}
