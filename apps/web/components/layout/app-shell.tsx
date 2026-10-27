"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WorkQueueProvider } from "@/lib/work-queue";
import { BottomNav } from "./bottom-nav";
import { CommandPalette } from "./command-palette";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();

  // Ctrl/⌘ + K opens the command bar from anywhere in the workspace
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <WorkQueueProvider>
      <div className="min-h-screen bg-[#F7F7F6]">
        {sidebarOpen ? (
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-30 bg-[#30343B]/40 backdrop-blur-xs lg:hidden"
            onClick={() => setSidebarOpen(false)}
            type="button"
          />
        ) : null}
        <Sidebar onNavigate={() => setSidebarOpen(false)} open={sidebarOpen} />
        <div className="min-h-screen lg:pl-64">
          <Topbar onMenuClick={() => setSidebarOpen(true)} onOpenSearch={() => setPaletteOpen(true)} />
          <main className="mx-auto w-full max-w-screen-2xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:py-8">
            {/* Keyed by route so each page gently fades in on navigation (opacity only, so fixed-position modals are unaffected) */}
            <div className="page-fade" key={pathname}>
              {children}
            </div>
          </main>
        </div>
        <BottomNav onOpenMenu={() => setSidebarOpen(true)} onOpenSearch={() => setPaletteOpen(true)} />
        <CommandPalette onClose={() => setPaletteOpen(false)} open={paletteOpen} />
      </div>
    </WorkQueueProvider>
  );
}
