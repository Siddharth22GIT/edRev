import { StudentTierScreen } from "@/components/screens/student-screens";

export default async function StudentTierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentTierScreen id={id} />;
}
