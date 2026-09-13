import { StudentDetailScreen } from "@/components/screens/student-screens";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentDetailScreen id={id} />;
}
