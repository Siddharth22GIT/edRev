"use client";

import { useState } from "react";
import { DEFAULT_USER_PREFERENCES } from "@edurev/types";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";

/**
 * U3: whether the workspace icon rail is collapsed, saved on `user.preferences.navCollapsed` so it follows the
 * account to other devices. Applied at once; if saving fails the choice stays on this device and a toast says so.
 */
export function useNavCollapsed(): { collapsed: boolean; toggle: () => void; saving: boolean } {
  const { user, updateUser } = useAuth();
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const collapsed = Boolean(user?.preferences?.navCollapsed);

  const toggle = async () => {
    if (!user) return;
    const next = !collapsed;
    const current = { ...DEFAULT_USER_PREFERENCES, ...user.preferences };
    updateUser({ preferences: { ...current, navCollapsed: next } });
    setSaving(true);
    try {
      const res = await apiFetch("/auth/me/preferences", { method: "PATCH", body: JSON.stringify({ navCollapsed: next }) });
      if (!res.ok) throw new Error();
    } catch {
      toast("Couldn't save the menu setting. It applies on this device only for now.", "info");
    } finally {
      setSaving(false);
    }
  };

  return { collapsed, toggle, saving };
}
