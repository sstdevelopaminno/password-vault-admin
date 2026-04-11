"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const GENERIC_DENY_MESSAGE =
  "This account is not allowed to access Admin Backoffice. Please contact the owner.";

export function AdminLoginForm() {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function hasAdminAccess() {
    const response = await fetch("/api/admin/stats", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    return response.ok;
  }

  useEffect(() => {
    let cancelled = false;

    async function checkCurrentSession() {
      const allowed = await hasAdminAccess().catch(() => false);
      if (cancelled) return;

      if (allowed) {
        startTransition(() => {
          router.replace("/");
          router.refresh();
        });
        return;
      }

      setIsCheckingSession(false);
    }

    void checkCurrentSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isNavigating) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message || "Unable to sign in. Please try again.");
        return;
      }

      const allowed = await hasAdminAccess();
      if (!allowed) {
        await supabase.auth.signOut();
        setErrorMessage(GENERIC_DENY_MESSAGE);
        return;
      }

      startTransition(() => {
        router.replace("/");
        router.refresh();
      });
    } catch {
      setErrorMessage("Unable to sign in right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="office-shell p-6 md:p-7">
      <header className="panel">
        <span className="badge">Helpdesk Backoffice</span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Admin Sign In</h1>
        <p className="mt-2 max-w-3xl text-sm muted">
          Sign in with your approved staff account. Access is limited to active Approver, Admin, and Owner roles.
        </p>
      </header>

      <section className="panel mt-4 max-w-2xl">
        {isCheckingSession ? (
          <p className="text-sm muted">Checking your current session...</p>
        ) : (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-sm font-semibold">
              Staff Email
              <input
                className="admin-input"
                autoComplete="email"
                inputMode="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="staff@yourcompany.com"
                required
                type="email"
                value={email}
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              Password
              <input
                className="admin-input"
                autoComplete="current-password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type="password"
                value={password}
              />
            </label>

            {errorMessage ? <p className="error-banner text-sm">{errorMessage}</p> : null}

            <button className="primary-button mt-1" disabled={isSubmitting || isNavigating} type="submit">
              {isSubmitting || isNavigating ? "Signing in..." : "Sign In to Admin"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
