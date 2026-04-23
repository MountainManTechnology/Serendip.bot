"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const key = form.get("key") as string;

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });

      if (res.ok) {
        router.refresh();
        router.push("/admin");
      } else {
        setError("Invalid admin key.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-lg p-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-[#0f0d1a]">Admin Login</h1>
          <p className="text-sm text-gray-500">
            Enter your admin key to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="key"
              className="block text-sm font-medium text-gray-700"
            >
              Admin Key
            </label>
            <input
              id="key"
              name="key"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#0f0d1a] focus:outline-none focus:ring-2 focus:ring-[#7b5ea7] placeholder-gray-300"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[#7b5ea7] text-white font-semibold text-sm hover:bg-[#6a4e96] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Checking…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
