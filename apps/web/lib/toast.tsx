"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { IconAlertTriangle, IconCheckCircle, IconX } from "@/components/ui/icons";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextType {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const toneStyles: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-white text-emerald-800 [&_.toast-icon]:bg-emerald-50 [&_.toast-icon]:text-emerald-600",
  error: "border-rose-200 bg-white text-rose-800 [&_.toast-icon]:bg-rose-50 [&_.toast-icon]:text-rose-600",
  info: "border-[#C2DCF2] bg-white text-[#2F659C] [&_.toast-icon]:bg-[#EFF6FC] [&_.toast-icon]:text-[#3978B8]",
};

/** Small, non-blocking notifications (replaces browser alert() popups). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list.slice(-3), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? 6000 : 4000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-20 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2 lg:bottom-6 lg:right-6">
        {toasts.map((t) => (
          <div
            className={`rise-in pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 text-sm font-semibold shadow-dropdown ${toneStyles[t.tone]}`}
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
          >
            <span className="toast-icon grid h-7 w-7 shrink-0 place-items-center rounded-lg">
              {t.tone === "error" ? <IconAlertTriangle size={16} /> : <IconCheckCircle size={16} />}
            </span>
            <span className="flex-1 pt-1 leading-snug">{t.message}</span>
            <button aria-label="Dismiss" className="rounded-md p-1 text-[#8C93A0] hover:bg-[#F7F7F6]" onClick={() => dismiss(t.id)} type="button">
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
