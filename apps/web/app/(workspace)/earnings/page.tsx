import { EarningsScreen } from "@/components/screens/operations-screens";
import { RequirePermission } from "@/components/ui/require-permission";

export const dynamic = "force-dynamic";

export default function EarningsPage() {
  // SYS-10: same rule as the sidebar link (lib/navigation.ts) and the API
  return (
    <RequirePermission
      alsoAllow={["EARNINGS_VIEW_ALL"]}
      description="Earnings are visible to the students who record them and to staff who verify them."
      permission="EARNINGS_SUBMIT"
    >
      <EarningsScreen />
    </RequirePermission>
  );
}
