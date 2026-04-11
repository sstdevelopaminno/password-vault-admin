"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const BRAND_LOGO_URL =
  "https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/D-001.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzL0QtMDAxLnBuZyIsImlhdCI6MTc3NTkzNDgwMywiZXhwIjoxODA3NDcwODAzfQ.owIqb6_Dc2-wA9iUiisiOr-tnhUgbBW37ivTPCWCA74";

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
      <div className="login-wrapper">
        <aside className="left-panel">
          <div className="wave-1" />
          <div className="wave-2" />

          <div className="brand-box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Blueback Logo" className="brand-logo-image" src={BRAND_LOGO_URL} />
            <div className="brand-name">vault Support</div>
          </div>

          <div className="brand-desc">
            การเข้าถึงหรือเปิดเผยข้อมูลผู้ใช้งานโดยไม่ได้รับอนุญาต ถือเป็นความผิดร้ายแรง และจะถูกดำเนินการตามกฎหมายสูงสุด
          </div>
        </aside>

        <section className="right-panel">
          <div className="login-box">
            <h1>password vault / Support</h1>
            <p className="subtitle">Login in to your account to continue</p>

            {initialNotice ? <p className="info-banner text-sm">{initialNotice}</p> : null}

            {isCheckingSession ? (
              <p className="subtitle checking-text">Checking your current session...</p>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <input
                    autoComplete="email"
                    className="form-control"
                    inputMode="email"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Email"
                    required
                    type="email"
                    value={email}
                  />
                </div>

                <div className="form-group">
                  <input
                    autoComplete="current-password"
                    className="form-control"
                    name="password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    required
                    type="password"
                    value={password}
                  />
                </div>

                <button className="forgot-password" onClick={(event) => event.preventDefault()} type="button">
                  forgot your password?
                </button>

                {errorMessage ? <p className="error-banner text-sm">{errorMessage}</p> : null}

                <button className="login-btn" disabled={isSubmitting || isNavigating} type="submit">
                  {isSubmitting || isNavigating ? "LOGGING IN..." : "LOG IN"}
                </button>
              </form>
            )}

            <div className="signup-text">
              {"Don't have an account? "}
              <button className="signup-link" onClick={(event) => event.preventDefault()} type="button">
                Sign Up
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
