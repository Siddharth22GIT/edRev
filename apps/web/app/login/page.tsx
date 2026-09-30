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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-lg space-y-8 rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-600 text-2xl font-black text-white shadow-lg shadow-blue-500/30">
            R
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">REVALANCHE</h1>
          <p className="mt-1 text-sm text-slate-400">Institutional Operating System</p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-center text-sm font-medium text-rose-400">
            {error}
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@revalanche.local"
              required
              type="email"
              value={email}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />
          </div>

          <button
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? "Authenticating…" : "Sign In to REVALANCHE"}
          </button>
        </form>

        <div className="border-t border-slate-800 pt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Development Quick Roles (Click to fill)
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              className="rounded-lg border border-slate-800 bg-slate-800/40 px-2.5 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
              onClick={() => quickFill("student@revalanche.local")}
              type="button"
            >
              Student
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-800/40 px-2.5 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
              onClick={() => quickFill("analyst@revalanche.local")}
              type="button"
            >
              Bid Desk Analyst
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-800/40 px-2.5 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
              onClick={() => quickFill("editor@revalanche.local")}
              type="button"
            >
              Proposal Editor
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-800/40 px-2.5 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
              onClick={() => quickFill("guild@revalanche.local")}
              type="button"
            >
              Guild Lead / Mentor
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-800/40 px-2.5 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
              onClick={() => quickFill("coordinator@revalanche.local")}
              type="button"
            >
              Cell Coordinator
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-800/40 px-2.5 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
              onClick={() => quickFill("faculty@revalanche.local")}
              type="button"
            >
              Faculty Director
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-800/40 px-2.5 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
              onClick={() => quickFill("placement@revalanche.local")}
              type="button"
            >
              Placement Office
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-800/40 px-2.5 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
              onClick={() => quickFill("dean@revalanche.local")}
              type="button"
            >
              Dean
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-800/40 px-2.5 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
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
