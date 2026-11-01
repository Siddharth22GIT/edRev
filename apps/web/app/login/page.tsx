"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AvalancheCanvas } from "@/components/login/avalanche-canvas";
import { CountUp } from "@/components/login/count-up";
import { SignupForm } from "@/components/login/signup-form";
import {
  IconAnalytics,
  IconArrowRight,
  IconBriefcase,
  IconEarnings,
  IconFileText,
  IconGraduationCap,
  IconSettings,
  IconShield,
  IconStudents,
  IconUserCheck,
} from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/logo";
import { useAuth } from "@/lib/auth-context";

const DEV_PASSWORD = "Password123!";

const demoRoles = [
  { email: "student@revalanche.local", label: "Student", line: "Bid & earn", icon: IconGraduationCap },
  { email: "analyst@revalanche.local", label: "Bid Desk Analyst", line: "Allocate work", icon: IconBriefcase },
  { email: "editor@revalanche.local", label: "Proposal Editor", line: "Review proposals", icon: IconFileText },
  { email: "guild@revalanche.local", label: "Guild Lead", line: "Mentor training", icon: IconStudents },
  { email: "coordinator@revalanche.local", label: "Cell Coordinator", line: "Run the cell", icon: IconUserCheck },
  { email: "faculty@revalanche.local", label: "Faculty Director", line: "Guard safeguards", icon: IconShield },
  { email: "placement@revalanche.local", label: "Placement Office", line: "Track outcomes", icon: IconAnalytics },
  { email: "dean@revalanche.local", label: "Dean", line: "Verify earnings", icon: IconEarnings },
  { email: "admin@revalanche.local", label: "Administrator", line: "Full control", icon: IconSettings },
];

const journey = ["Train", "Bid", "Earn", "Grow"];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("student@revalanche.local");
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accountStatus, setAccountStatus] = useState<{ code: string; message: string } | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  // Deep link: /login?mode=signup opens the sign-up form
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") setMode("signup");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in both email and password.");
      return;
    }

    setLoading(true);
    setError("");
    setAccountStatus(null);

    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      if (err?.code === "ACCOUNT_PENDING" || err?.code === "ACCOUNT_REJECTED") {
        setAccountStatus({ code: err.code, message: err.message });
      } else {
        setError(err.message || "Invalid credentials. Please check your email and password.");
      }
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (eMail: string) => {
    setEmail(eMail);
    setPassword(DEV_PASSWORD);
    setError("");
    setAccountStatus(null);
  };

  const switchMode = (next: "signin" | "signup", prefillEmail?: string) => {
    setMode(next);
    setError("");
    setAccountStatus(null);
    if (prefillEmail) {
      setEmail(prefillEmail);
      setPassword("");
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F6] lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* STORY PANEL */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#30343B] via-[#2B3F58] to-[#204D7D] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div aria-hidden="true" className="login-blob absolute -left-24 top-10 h-80 w-80 rounded-full bg-[#F2A65A]/25 blur-3xl" />
        <div aria-hidden="true" className="login-blob absolute -right-16 top-1/3 h-96 w-96 rounded-full bg-[#3978B8]/35 blur-3xl [animation-delay:-5s]" />
        <div aria-hidden="true" className="login-blob absolute bottom-1/3 left-1/3 h-56 w-56 rounded-full bg-[#FBD7B3]/15 blur-3xl [animation-delay:-9s]" />

        <div className="relative z-10 flex flex-col p-12 pb-6 xl:p-16 xl:pb-8 [@media(max-height:800px)]:pt-8">
          <div className="rise-in flex items-center gap-3">
            <LogoMark className="rounded-xl shadow-lg ring-2 ring-white/20" size={44} />
            <div>
              <span className="block text-lg font-extrabold tracking-tight text-white">REVALANCHE</span>
              <span className="block text-xs font-semibold text-[#C2DCF2]">Institutional Earning OS</span>
            </div>
          </div>

          <div className="mt-14 max-w-xl xl:mt-20 [@media(max-height:800px)]:mt-8">
            <div className="rise-in inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-[#FBD7B3] ring-1 ring-white/15 backdrop-blur [animation-delay:120ms]">
              {journey.map((stage, i) => (
                <span className="flex items-center gap-2" key={stage}>
                  {stage}
                  {i < journey.length - 1 && <IconArrowRight className="text-white/50" size={12} />}
                </span>
              ))}
            </div>

            <h1 className="rise-in mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-white [animation-delay:220ms] xl:text-5xl">
              Where student skills{" "}
              <span className="bg-gradient-to-r from-[#FBD7B3] via-[#F2A65A] to-[#E59443] bg-clip-text text-transparent">snowball</span>{" "}
              into real earnings.
            </h1>

            <p className="rise-in mt-5 max-w-md text-sm leading-relaxed text-[#C2DCF2] [animation-delay:320ms]">
              One workspace for training, curated client work, academic safeguards and verified earnings. Built for the
              institution, owned by the student.
            </p>

            <button
              className="rise-in mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#FBD7B3] transition hover:text-white [animation-delay:380ms]"
              onClick={() => switchMode("signup")}
              type="button"
            >
              New here? Create your student account <IconArrowRight size={14} />
            </button>

            <dl className="rise-in mt-8 grid max-w-md grid-cols-3 gap-3 [animation-delay:420ms]">
              <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur">
                <dd className="text-2xl font-extrabold text-white">
                  <CountUp delay={500} value={0} suffix="%" />
                </dd>
                <dt className="mt-0.5 text-[11px] font-semibold text-[#C2DCF2]">commission taken</dt>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur">
                <dd className="text-2xl font-extrabold text-white">
                  <CountUp delay={500} value={4} />
                </dd>
                <dt className="mt-0.5 text-[11px] font-semibold text-[#C2DCF2]">progression tiers</dt>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur">
                <dd className="text-2xl font-extrabold text-white">
                  <CountUp delay={500} value={20} suffix="h" />
                </dd>
                <dt className="mt-0.5 text-[11px] font-semibold text-[#C2DCF2]">weekly cap protects study</dt>
              </div>
            </dl>
          </div>
        </div>

        {/* The mountains take whatever height is left, so they never run into the text on short screens */}
        <div className="relative min-h-[140px] flex-1">
          <AvalancheCanvas className="absolute inset-0 h-full w-full" />
        </div>
      </section>

      {/* SIGN-IN PANEL */}
      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="rise-in w-full max-w-lg space-y-7 rounded-2xl border border-[#E6E6E6] bg-white p-7 shadow-panel sm:p-8">
          <div className="text-center">
            <LogoMark className="logo-pop mx-auto rounded-2xl shadow-sm ring-2 ring-[#FBD7B3]" size={56} />
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-[#30343B]">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
            <p className="mt-1 text-xs font-semibold text-[#3978B8]">
              {mode === "signin" ? "Sign in to your REVALANCHE workspace" : "For students with an @lpu.in email"}
            </p>
          </div>

          <div className="grid grid-cols-2 rounded-xl bg-[#F7F7F6] p-1 ring-1 ring-[#E6E6E6]" role="tablist">
            {(["signin", "signup"] as const).map((m) => (
              <button
                aria-selected={mode === m}
                className={`rounded-lg py-2 text-sm font-bold transition ${mode === m ? "bg-white text-[#30343B] shadow-sm ring-1 ring-[#E6E6E6]" : "text-[#666D7A] hover:text-[#30343B]"}`}
                key={m}
                onClick={() => switchMode(m)}
                role="tab"
                type="button"
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {mode === "signup" ? (
            <SignupForm onBackToSignIn={(prefill) => switchMode("signin", prefill)} />
          ) : (
          <>
          {accountStatus && (
            <div
              className={`rounded-xl border p-4 text-sm ${
                accountStatus.code === "ACCOUNT_PENDING" ? "border-[#FBD7B3] bg-[#FEF6EE] text-[#30343B]" : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
              role="status"
            >
              <p className={`font-bold ${accountStatus.code === "ACCOUNT_PENDING" ? "text-[#C27803]" : "text-rose-700"}`}>
                {accountStatus.code === "ACCOUNT_PENDING" ? "⏳ Awaiting approval" : "Request not approved"}
              </p>
              <p className="mt-1 text-xs leading-relaxed">{accountStatus.message}</p>
              {accountStatus.code === "ACCOUNT_REJECTED" && (
                <button className="mt-2 text-xs font-bold text-[#3978B8] hover:underline" onClick={() => switchMode("signup")} type="button">
                  Update my details and apply again →
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-4 py-2.5 text-sm text-[#30343B] placeholder-[#8C93A0] outline-none transition focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@revalanche.local"
                required
                type="email"
                value={email}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-4 py-2.5 text-sm text-[#30343B] placeholder-[#8C93A0] outline-none transition focus:border-[#3978B8] focus:bg-white focus:ring-2 focus:ring-[#C2DCF2]"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                type="password"
                value={password}
              />
            </div>

            <button
              className="w-full rounded-xl bg-[#F2A65A] py-3 text-sm font-bold text-[#30343B] shadow-sm ring-1 ring-[#FBD7B3] transition hover:bg-[#E59443] hover:shadow-[0_8px_20px_-6px_rgba(242,166,90,0.7)] active:scale-[0.99] disabled:opacity-50"
              disabled={loading}
              type="submit"
            >
              {loading ? "Authenticating…" : "Sign In to REVALANCHE"}
            </button>
          </form>

          <div className="border-t border-[#E6E6E6] pt-5">
            <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-wider text-[#666D7A]">
              Explore as a role (click to fill)
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {demoRoles.map(({ email: roleEmail, label, line, icon: Icon }) => {
                const selected = email === roleEmail;
                return (
                  <button
                    aria-pressed={selected}
                    className={`group flex items-start gap-2 rounded-xl border p-2.5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#F2A65A] hover:bg-[#FEF6EE] hover:shadow-[0_8px_20px_-8px_rgba(242,166,90,0.6)] ${
                      selected ? "border-[#F2A65A] bg-[#FEF6EE] ring-1 ring-[#FBD7B3]" : "border-[#E6E6E6] bg-[#F7F7F6]"
                    }`}
                    key={roleEmail}
                    onClick={() => quickFill(roleEmail)}
                    type="button"
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition ${
                        selected ? "bg-[#F2A65A] text-white" : "bg-white text-[#3978B8] group-hover:bg-[#F2A65A] group-hover:text-white"
                      }`}
                    >
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold leading-tight text-[#30343B]">{label}</span>
                      <span className="mt-0.5 block truncate text-[10.5px] text-[#666D7A]">{line}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          </>
          )}
        </div>
      </main>
    </div>
  );
}
