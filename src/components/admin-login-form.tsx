"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const BRAND_ICON_URL =
  "https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/848po7.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzLzg0OHBvNy5wbmciLCJpYXQiOjE3NzU5MjIzNjUsImV4cCI6MTgwNzQ1ODM2NX0.PTenXOe__6pLUUsXw7lRTwZ5sBfjuJaKpQzzjWmrZIM";

const GENERIC_DENY_MESSAGE =
  "This account is not allowed to access Admin Backoffice. Please contact the owner.";

type AdminLoginFormProps = {
  initialNotice?: string | null;
};

export function AdminLoginForm({ initialNotice = null }: AdminLoginFormProps) {
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
    <main className="auth-page">
      <section className="auth-shell auth-shell-v4">
        <aside className="auth-brand-v4">
          <div className="auth-brand-wave" />
          <div className="auth-brand-inner">
            <div className="auth-logo-wrap auth-logo-wrap-v4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Password Vault Admin" className="auth-logo auth-logo-v4" src={BRAND_ICON_URL} />
            </div>

            <p className="auth-badge-v4">HELPDESK BACKOFFICE</p>
            <h1 className="auth-title-v4">Password Vault Admin</h1>
            <p className="auth-subtitle-v4">
              Internal support control center for IT staff. Secure access for Approver, Admin and Owner only.
            </p>
          </div>

          <div className="auth-chip-row-v4">
            <span className="auth-chip-v4">User Support</span>
            <span className="auth-chip-v4">Audit & Compliance</span>
            <span className="auth-chip-v4">Billing Operations</span>
          </div>
        </aside>

        <section className="auth-form-v4">
          <h2 className="auth-form-title-v4">Admin Sign In</h2>
          <p className="auth-form-subtitle-v4">Sign in with your approved staff account to continue.</p>

          {initialNotice ? <p className="info-banner mt-4 text-sm">{initialNotice}</p> : null}

          {isCheckingSession ? (
            <p className="mt-6 text-sm auth-form-subtitle-v4">Checking your current session...</p>
          ) : (
            <form className="auth-form-grid-v4" onSubmit={handleSubmit}>
              <label className="grid gap-2 text-sm font-semibold auth-label-v4">
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

              <label className="grid gap-2 text-sm font-semibold auth-label-v4">
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

              <button className="primary-button auth-submit-v4" disabled={isSubmitting || isNavigating} type="submit">
                {isSubmitting || isNavigating ? "Signing in..." : "Sign In to Admin"}
              </button>
            </form>
          )}
        </section>
      </section>
    </main>
  );
}
