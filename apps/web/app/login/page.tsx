"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("student@revalanche.local");
  const [password, setPassword] = useState("Password123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in both email and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please check your email and password.");
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (eMail: string) => {
    setEmail(eMail);
    setPassword("Password123!");
    setError("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F7F6] px-4 py-12">
      <div className="w-full max-w-lg space-y-7 rounded-2xl border border-[#E6E6E6] bg-white p-8 shadow-card">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F2A65A] text-2xl font-black text-[#30343B] shadow-sm ring-2 ring-[#FBD7B3]">
            R
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-[#30343B]">REVALANCHE</h1>
          <p className="mt-1 text-xs font-semibold text-[#3978B8]">Institutional Operating System</p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
            className="w-full rounded-xl bg-[#F2A65A] py-3 text-sm font-bold text-[#30343B] shadow-sm transition hover:bg-[#E59443] active:scale-[0.99] disabled:opacity-50 ring-1 ring-[#FBD7B3]"
            disabled={loading}
            type="submit"
          >
            {loading ? "Authenticating…" : "Sign In to REVALANCHE"}
          </button>
        </form>

        <div className="border-t border-[#E6E6E6] pt-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#666D7A] text-center">
            Development Quick Roles (Click to fill)
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-2.5 py-2 font-semibold text-[#30343B] transition hover:bg-[#FEF6EE] hover:border-[#F2A65A] hover:text-[#C27803]"
              onClick={() => quickFill("student@revalanche.local")}
              type="button"
            >
              Student
            </button>
            <button
              className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-2.5 py-2 font-semibold text-[#30343B] transition hover:bg-[#FEF6EE] hover:border-[#F2A65A] hover:text-[#C27803]"
              onClick={() => quickFill("analyst@revalanche.local")}
              type="button"
            >
              Bid Desk Analyst
            </button>
            <button
              className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-2.5 py-2 font-semibold text-[#30343B] transition hover:bg-[#FEF6EE] hover:border-[#F2A65A] hover:text-[#C27803]"
              onClick={() => quickFill("editor@revalanche.local")}
              type="button"
            >
              Proposal Editor
            </button>
            <button
              className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-2.5 py-2 font-semibold text-[#30343B] transition hover:bg-[#FEF6EE] hover:border-[#F2A65A] hover:text-[#C27803]"
              onClick={() => quickFill("guild@revalanche.local")}
              type="button"
            >
              Guild Lead
            </button>
            <button
              className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-2.5 py-2 font-semibold text-[#30343B] transition hover:bg-[#FEF6EE] hover:border-[#F2A65A] hover:text-[#C27803]"
              onClick={() => quickFill("coordinator@revalanche.local")}
              type="button"
            >
              Cell Coordinator
            </button>
            <button
              className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-2.5 py-2 font-semibold text-[#30343B] transition hover:bg-[#FEF6EE] hover:border-[#F2A65A] hover:text-[#C27803]"
              onClick={() => quickFill("faculty@revalanche.local")}
              type="button"
            >
              Faculty Director
            </button>
            <button
              className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-2.5 py-2 font-semibold text-[#30343B] transition hover:bg-[#FEF6EE] hover:border-[#F2A65A] hover:text-[#C27803]"
              onClick={() => quickFill("placement@revalanche.local")}
              type="button"
            >
              Placement Office
            </button>
            <button
              className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-2.5 py-2 font-semibold text-[#30343B] transition hover:bg-[#FEF6EE] hover:border-[#F2A65A] hover:text-[#C27803]"
              onClick={() => quickFill("dean@revalanche.local")}
              type="button"
            >
              Dean
            </button>
            <button
              className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] px-2.5 py-2 font-semibold text-[#30343B] transition hover:bg-[#FEF6EE] hover:border-[#F2A65A] hover:text-[#C27803]"
              onClick={() => quickFill("admin@revalanche.local")}
              type="button"
            >
              Administrator
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
