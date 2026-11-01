"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { can, type Permission } from "@edurev/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconShield } from "@/components/ui/icons";
import { useAuth } from "@/lib/auth-context";

/**
 * Page-level guard: renders children only for roles holding `permission` (or any of `alsoAllow`),
 * otherwise a friendly notice. This is for clarity in the UI; the API enforces the same permission independently.
 */
export function RequirePermission({
  permission,
  alsoAllow = [],
  children,
  title = "Not available for your role",
  description = "This page is managed by other roles. If you think you need access, contact your administrator.",
  action,
}: {
  permission: Permission;
  /** Other permissions that also open the page (e.g. Earnings: submit OR view all). */
  alsoAllow?: Permission[];
  children: ReactNode;
  title?: string;
  description?: string;
  action?: { href: string; label: string };
}) {
  const { user } = useAuth();
  if ([permission, ...alsoAllow].some((p) => can(user?.role, p))) return <>{children}</>;

  return (
    <EmptyState
      action={
        action ? (
          <Link href={action.href}>
            <Button variant="primary">{action.label}</Button>
          </Link>
        ) : undefined
      }
      description={description}
      icon={<IconShield size={22} />}
      title={title}
    />
  );
}
