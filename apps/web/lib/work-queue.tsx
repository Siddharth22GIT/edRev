"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { can, type EarningsEntry, type Opportunity, type Proposal } from "@edurev/types";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface WorkQueue {
  /** Earnings waiting for verification (verifier roles only). */
  pendingEarnings: EarningsEntry[];
  /** Opportunities that have bids and are waiting for allocation (allocator roles only). */
  reviewOpportunities: Opportunity[];
  /** Proposals sitting in review (proposal editors and administrators). */
  reviewProposals: Proposal[];
  loading: boolean;
  /** Badge counts keyed by sidebar route. */
  counts: Record<string, number>;
  refresh: () => void;
}

const WorkQueueContext = createContext<WorkQueue | undefined>(undefined);

/**
 * Collects "things waiting for you" from existing API endpoints, based on the signed-in role.
 * Feeds the dashboard to-do list and the sidebar count badges; refreshes on every navigation.
 */
export function WorkQueueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const pathname = usePathname();
  const [pendingEarnings, setPendingEarnings] = useState<EarningsEntry[]>([]);
  const [reviewOpportunities, setReviewOpportunities] = useState<Opportunity[]>([]);
  const [reviewProposals, setReviewProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const role = user?.role;

  useEffect(() => {
    if (!role) return;
    let cancelled = false;

    const readList = async <T,>(path: string): Promise<T[]> => {
      try {
        const res = await apiFetch(path);
        if (!res.ok) return [];
        const json = await res.json();
        return Array.isArray(json?.data) ? json.data : [];
      } catch {
        return [];
      }
    };

    (async () => {
      const [earnings, opportunities, proposals] = await Promise.all([
        can(role, "EARNINGS_VERIFY") ? readList<EarningsEntry>("/earnings") : Promise.resolve([]),
        can(role, "OPPORTUNITY_ALLOCATE") ? readList<Opportunity>("/opportunities") : Promise.resolve([]),
        role === "PROPOSAL_EDITOR" || role === "ADMINISTRATOR" ? readList<Proposal>("/proposals") : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setPendingEarnings(earnings.filter((e) => e.verificationStatus === "PENDING"));
      setReviewOpportunities(opportunities.filter((o) => o.status === "UNDER_REVIEW"));
      setReviewProposals(proposals.filter((p) => p.status === "IN_REVIEW"));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // apiFetch is recreated each render; re-run only when the role, route or an explicit refresh changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, pathname, version]);

  const counts = {
    "/earnings": pendingEarnings.length,
    "/opportunities": reviewOpportunities.length,
    "/proposals": reviewProposals.length,
  };

  return (
    <WorkQueueContext.Provider
      value={{ pendingEarnings, reviewOpportunities, reviewProposals, loading, counts, refresh: () => setVersion((v) => v + 1) }}
    >
      {children}
    </WorkQueueContext.Provider>
  );
}

export function useWorkQueue() {
  const context = useContext(WorkQueueContext);
  if (!context) throw new Error("useWorkQueue must be used within a WorkQueueProvider");
  return context;
}
