import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/lib/toast";

// U1: self-hosted at build time by next/font (no request to Google from the browser, so the CSP stays 'self').
// If a font can't load, the system fallbacks in globals.css take over; scripts Inter lacks (e.g. Devanagari in a
// name) fall through to the system fonts listed there.
const sans = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-mono", weight: ["500", "700"] });

export const metadata: Metadata = {
  title: {
    default: "REVALANCHE",
    template: "%s · REVALANCHE",
  },
  description: "REVALANCHE Student Earning & Venture Tracking Operations OS",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`${sans.variable} ${mono.variable}`} lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
