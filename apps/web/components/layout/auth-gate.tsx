"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Renders workspace pages only for a signed-in user. Screens therefore mount after the session token
 * has been restored, so their first API calls are always authenticated.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#F7F7F6] text-sm font-semibold text-[#666D7A]">
        {isLoading ? "Restoring your session…" : "Redirecting to sign in…"}
      </div>
    );
  }

  return <>{children}</>;
}
