"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/layout/auth-gate";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { useAuth } from "@/lib/auth-context";
import { MyProfileProvider } from "@/lib/my-profile";

/** Full-screen onboarding, outside the workspace shell. Students only; other roles go to the dashboard. */
export default function OnboardingPage() {
  return (
    <AuthGate>
      <MyProfileProvider>
        <StudentsOnly>
          <OnboardingWizard />
        </StudentsOnly>
      </MyProfileProvider>
    </AuthGate>
  );
}

function StudentsOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const isStudent = user?.role === "STUDENT";

  useEffect(() => {
    if (user && !isStudent) router.replace("/dashboard");
  }, [user, isStudent, router]);

  return isStudent ? <>{children}</> : null;
}
