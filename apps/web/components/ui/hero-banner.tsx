import type { ReactNode } from "react";

/** Brand gradient strip (echoes the login page) used at the top of the dashboard. */
export function HeroBanner({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#30343B] via-[#2B3F58] to-[#204D7D] px-6 py-7 text-white shadow-panel sm:px-8">
      <div aria-hidden="true" className="login-blob absolute -left-16 -top-20 h-56 w-56 rounded-full bg-[#F2A65A]/25 blur-3xl" />
      <div aria-hidden="true" className="login-blob absolute -bottom-24 right-10 h-64 w-64 rounded-full bg-[#3978B8]/40 blur-3xl [animation-delay:-6s]" />
      {/* Quiet mountain silhouette, a nod to the logo */}
      <svg aria-hidden="true" className="absolute bottom-0 right-0 h-24 w-80 opacity-20" preserveAspectRatio="none" viewBox="0 0 320 96">
        <path d="M0 96 L70 40 L110 70 L170 14 L240 72 L270 50 L320 80 L320 96 Z" fill="#FBD7B3" />
      </svg>

      <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          {eyebrow && <p className="text-xs font-bold uppercase tracking-wider text-[#FBD7B3]">{eyebrow}</p>}
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <div className="mt-1.5 text-sm text-[#C2DCF2]">{subtitle}</div>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
      </div>
    </section>
  );
}

/** First name for greetings, skipping titles such as "Dr." or "Prof.". */
export function firstName(fullName: string): string {
  const parts = fullName.split(/\s+/).filter(Boolean);
  const titles = /^(dr|prof|mr|mrs|ms|miss|sir)\.?$/i;
  return parts.find((part) => !titles.test(part)) ?? fullName;
}

export function greetingFor(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
