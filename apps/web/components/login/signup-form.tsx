"use client";

import { useEffect, useState } from "react";
import { SIGNUP_COURSES, SIGNUP_PROGRAMS } from "@edurev/types";
import { IconCheckCircle, IconClock, IconShield } from "@/components/ui/icons";
import { API_BASE } from "@/lib/api";

const field =
  "mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-4 py-2.5 text-sm text-[#30343B] placeholder-[#8C93A0] outline-none transition focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]";
const labelCls = "block text-xs font-bold uppercase tracking-wider text-[#666D7A]";

/** Student self sign-up. Creates a request that a Cell Coordinator or Administrator approves. */
export function SignupForm({ onBackToSignIn }: { onBackToSignIn: (email?: string) => void }) {
  const [config, setConfig] = useState<{ enabled: boolean; domains: string[] } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [program, setProgram] = useState<string>(SIGNUP_PROGRAMS[0]);
  const [course, setCourse] = useState<string>(SIGNUP_COURSES[0]);
  const [year, setYear] = useState(1);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot: hidden from people, bots fill it in
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/auth/signup-config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setConfig(json?.data ?? { enabled: false, domains: ["lpu.in"] }))
      .catch(() => setConfig({ enabled: false, domains: ["lpu.in"] }));
  }, []);

  const domains = config?.domains ?? ["lpu.in"];
  const emailDomain = email.trim().toLowerCase().split("@")[1] ?? "";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && domains.includes(emailDomain);
  const rules = [
    { ok: password.length >= 8, label: "8+ characters" },
    { ok: /[A-Za-z]/.test(password) && /\d/.test(password), label: "A letter and a number" },
    { ok: password.length > 0 && password === confirm, label: "Passwords match" },
  ];
  const valid =
    /^[A-Za-z][A-Za-z .'-]{1,59}$/.test(name.trim()) && emailOk && /^[A-Za-z0-9]{4,20}$/.test(registrationNumber.trim()) && rules.every((r) => r.ok) && accepted;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), registrationNumber: registrationNumber.trim(), program, course, year, password, acceptSafeguards: accepted, website }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Sign-up failed. Please try again.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="rise-in text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#FEF6EE] text-[#C27803] ring-1 ring-[#FBD7B3]">
          <IconClock size={26} />
        </span>
        <h3 className="mt-4 text-xl font-extrabold text-[#30343B]">Request received</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#666D7A]">
          Your cell coordinator will review your details. Once approved, sign in with <strong className="text-[#30343B]">{email.trim().toLowerCase()}</strong> and we&apos;ll
          help you set up your profile.
        </p>
        <button
          className="mt-6 w-full rounded-xl bg-[#F2A65A] py-3 text-sm font-bold text-[#30343B] shadow-sm ring-1 ring-[#FBD7B3] transition hover:bg-[#E59443]"
          onClick={() => onBackToSignIn(email.trim().toLowerCase())}
          type="button"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  if (config && !config.enabled) {
    return (
      <div className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] p-5 text-center text-sm text-[#666D7A]">
        <IconShield className="mx-auto mb-2 text-[#3978B8]" size={22} />
        <p className="font-bold text-[#30343B]">Sign-ups are currently closed</p>
        <p className="mt-1">Please contact your cell coordinator to get an account.</p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm font-semibold text-rose-700">{error}</div>}

      <div>
        <label className={labelCls} htmlFor="su-name">
          Full name
        </label>
        <input autoComplete="name" className={field} id="su-name" maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="As on your college ID" required value={name} />
      </div>

      <div>
        <label className={labelCls} htmlFor="su-email">
          College email
        </label>
        <input
          autoComplete="email"
          className={`${field} ${email && !emailOk ? "border-rose-300 ring-1 ring-rose-200" : ""}`}
          id="su-email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder={`yourname@${domains[0]}`}
          required
          type="email"
          value={email}
        />
        <p className={`mt-1 text-[11px] ${email && !emailOk ? "font-semibold text-rose-600" : "text-[#8C93A0]"}`}>
          Only {domains.map((d) => `@${d}`).join(" / ")} addresses can register.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="su-reg">
            Registration no.
          </label>
          <input className={field} id="su-reg" maxLength={20} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="e.g. 12345678" required value={registrationNumber} />
        </div>
        <div>
          <label className={labelCls} htmlFor="su-year">
            Year
          </label>
          <select className={field} id="su-year" onChange={(e) => setYear(Number(e.target.value))} value={year}>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="su-program">
            Program
          </label>
          <select className={field} id="su-program" onChange={(e) => setProgram(e.target.value)} value={program}>
            {SIGNUP_PROGRAMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="su-course">
            Course
          </label>
          <select className={field} id="su-course" onChange={(e) => setCourse(e.target.value)} value={course}>
            {SIGNUP_COURSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="su-password">
            Password
          </label>
          <input autoComplete="new-password" className={field} id="su-password" maxLength={128} onChange={(e) => setPassword(e.target.value)} required type="password" value={password} />
        </div>
        <div>
          <label className={labelCls} htmlFor="su-confirm">
            Confirm password
          </label>
          <input autoComplete="new-password" className={field} id="su-confirm" maxLength={128} onChange={(e) => setConfirm(e.target.value)} required type="password" value={confirm} />
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {rules.map((r) => (
          <li className={r.ok ? "font-semibold text-emerald-700" : "text-[#8C93A0]"} key={r.label}>
            {r.ok ? "✓" : "○"} {r.label}
          </li>
        ))}
      </ul>

      {/* Honeypot: visually hidden and skipped by keyboard and screen readers */}
      <input aria-hidden="true" autoComplete="off" className="hidden" name="website" onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} value={website} />

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/60 p-3 text-xs leading-relaxed text-[#666D7A]">
        <input checked={accepted} className="mt-0.5 h-4 w-4 accent-[#F2A65A]" onChange={(e) => setAccepted(e.target.checked)} type="checkbox" />
        <span>
          I agree to the <strong className="text-[#30343B]">academic safeguards</strong>: a 20-hour weekly work cap, minimum CGPA rules and no new work during exam
          blackouts.
        </span>
      </label>

      <button
        className="w-full rounded-xl bg-[#F2A65A] py-3 text-sm font-bold text-[#30343B] shadow-sm ring-1 ring-[#FBD7B3] transition hover:bg-[#E59443] hover:shadow-[0_8px_20px_-6px_rgba(242,166,90,0.7)] active:scale-[0.99] disabled:opacity-50"
        disabled={!valid || submitting || !config}
        type="submit"
      >
        {submitting ? "Sending request…" : "Create my student account"}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#8C93A0]">
        <IconCheckCircle size={12} /> New accounts start at TIER 1 and are approved by your cell coordinator.
      </p>
    </form>
  );
}
