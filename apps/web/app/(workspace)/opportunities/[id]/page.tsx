import { OpportunityDetailScreen } from "@/components/screens/opportunity-screens";

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OpportunityDetailScreen id={id} />;
}
