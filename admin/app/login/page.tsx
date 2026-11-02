"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminApiError } from "@/lib/api/admin-client";
import { useAdminAuth } from "@/components/auth/admin-auth-provider";

function LoginForm() {
  const { login, admin } = useAdminAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (admin) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      const next = searchParams.get("next") || "/sales-engine";
      router.replace(next.startsWith("/") ? next : "/sales-engine");
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to sign in. Check your credentials and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f2a33] p-8 text-white shadow-xl"
    >
      <h1 className="text-2xl font-light tracking-tight">
        Sales<em>Engine</em> Admin
      </h1>
      <p className="mt-2 text-sm text-white/60">
        Sign in with your platform admin credentials.
      </p>

      <label className="mt-6 block text-sm text-white/80">
        Email
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-white outline-none focus:border-[#2ae9c9]"
        />
      </label>

      <label className="mt-4 block text-sm text-white/80">
        Password
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-white outline-none focus:border-[#2ae9c9]"
        />
      </label>

      {error && (
        <p
          className="mt-4 rounded-lg bg-[#ff6b6b]/15 px-3 py-2 text-sm text-[#ff8f8f]"
          role="alert"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-lg bg-[#2ae9c9] px-4 py-2.5 text-sm font-semibold text-[#06252b] disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#041014]">
      <Suspense
        fallback={
          <div className="text-white/70 text-sm">Loading sign-in…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
