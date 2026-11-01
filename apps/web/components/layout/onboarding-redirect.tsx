"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useMyProfile } from "@/lib/my-profile";

/** Sends a student to the onboarding wizard on first sign-in, until they finish it or choose "later". */
export function OnboardingRedirect() {
  const { user } = useAuth();
  const { student, loading } = useMyProfile();
  const router = useRouter();

  const needsOnboarding = user?.role === "STUDENT" && !loading && student && !student.onboardingCompletedAt && !student.onboardingSkippedAt;

  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  return null;
}
