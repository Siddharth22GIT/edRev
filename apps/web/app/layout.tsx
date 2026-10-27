import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/lib/toast";

export const metadata: Metadata = {
  title: {
    default: "REVALANCHE",
    template: "%s · REVALANCHE",
  },
  description: "REVALANCHE Student Earning & Venture Tracking Operations OS",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
