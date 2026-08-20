"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Login failed");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080b10] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,196,0,0.08),transparent_32%),linear-gradient(135deg,rgba(24,31,42,0.55),transparent_48%)]" />
      <div className="relative w-full max-w-md space-y-7">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-[#252a33] bg-[#11161e] shadow-2xl">
            <Image src="/EY_logo.png" alt="EY Logo" width={42} height={42} className="object-contain" priority />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f5c400]">EY RegData</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#f2f4f7]">RegData Xplainer</h1>
            <p className="mt-1 text-sm text-[#8c96a8]">Sign in to continue</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-md border border-[#252a33] bg-[#0f141c] p-6 shadow-2xl sm:p-7">
          <div className="border-b border-[#252a33] pb-4">
            <p className="text-sm font-medium text-[#f2f4f7]">Workspace access</p>
            <p className="mt-1 text-xs text-[#8c96a8]">Use your credentials to open the regulatory data workspace.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wide text-[#aeb7c6]">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-11 w-full rounded-sm border border-[#303845] bg-[#080b10] px-3 text-sm text-[#f2f4f7] placeholder:text-[#687386] outline-none transition-colors focus:border-[#f5c400] focus:ring-2 focus:ring-[#f5c400]/20"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-[#aeb7c6]">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-sm border border-[#303845] bg-[#080b10] px-3 text-sm text-[#f2f4f7] placeholder:text-[#687386] outline-none transition-colors focus:border-[#f5c400] focus:ring-2 focus:ring-[#f5c400]/20"
            />
          </div>

          {error && (
            <p className="border-l-2 border-red-500 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-sm bg-[#f5c400] px-4 text-sm font-semibold text-[#080b10] shadow-lg shadow-[#f5c400]/10 transition-colors hover:bg-[#ffd32a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
