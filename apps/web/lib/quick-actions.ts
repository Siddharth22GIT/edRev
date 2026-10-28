"use client";

import { useEffect, useRef } from "react";
import { can, type Permission, type Role } from "@edurev/types";

export type QuickActionId = "new-earning" | "new-opportunity" | "new-proposal" | "change-photo";

export interface QuickAction {
  id: QuickActionId;
  label: string;
  hint: string;
  path: string;
  permission: Permission;
}

/** Shortcuts offered by the "+ New" menu and the Ctrl+K command bar. Each opens an existing form. */
export const quickActions: QuickAction[] = [
  { id: "new-earning", label: "Log an earning", hint: "Submit freelance income for verification", path: "/earnings", permission: "EARNINGS_SUBMIT" },
  { id: "new-opportunity", label: "Add an opportunity", hint: "Publish client work for students", path: "/opportunities", permission: "OPPORTUNITY_CREATE" },
  { id: "new-proposal", label: "Create a proposal", hint: "Start a proposal draft", path: "/proposals", permission: "PROPOSAL_CREATE" },
];

export function quickActionsFor(role: Role | undefined): QuickAction[] {
  return quickActions.filter((action) => can(role, action.permission));
}

const EVENT = "edurev:quick-action";

/**
 * Triggers a quick action: if the target page is already open it is told directly,
 * otherwise we navigate there with `?action=<id>` and the page picks it up on mount.
 */
export function runQuickAction(action: Pick<QuickAction, "id" | "path">, pathname: string, push: (href: string) => void) {
  if (pathname === action.path) {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: action.id }));
  } else {
    push(`${action.path}?action=${action.id}`);
  }
}

/** Lets a page respond to a quick action (e.g. open its "create" form). */
export function useQuickAction(id: QuickActionId, handler: () => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === id) {
      params.delete("action");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
      handlerRef.current();
    }

    const listener = (event: Event) => {
      if ((event as CustomEvent).detail === id) handlerRef.current();
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [id]);
}
