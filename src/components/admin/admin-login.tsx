"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AdminLoginProps = {
  isConfigured: boolean;
};

export function AdminLogin({ isConfigured }: AdminLoginProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ password }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      setError("That password did not work.");
      return;
    }

    router.refresh();
  }

  return (
    <main className="flex h-dvh items-center justify-center bg-black p-6 text-white">
      <form
        onSubmit={submitLogin}
        className="grid w-full max-w-sm gap-4 border border-white/20 bg-black p-5"
      >
        <div>
          <h1 className="text-lg font-semibold">Paper Planet Admin</h1>
          <p className="mt-1 text-sm text-white/60">Enter the admin password.</p>
        </div>

        {!isConfigured ? (
          <p className="border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">
            ADMIN_PASSWORD is not configured.
          </p>
        ) : null}

        <label className="grid gap-1 text-sm">
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="border border-white/25 bg-black px-3 py-2 text-white outline-none focus:border-white"
          />
        </label>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <button
          type="submit"
          disabled={!isConfigured || isSubmitting}
          className="bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/30"
        >
          {isSubmitting ? "Checking..." : "Enter Admin"}
        </button>
      </form>
    </main>
  );
}
