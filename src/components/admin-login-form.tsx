"use client";

import QRCode from "qrcode";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const BRAND_LOGO_URL =
  "https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/D-001.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzL0QtMDAxLnBuZyIsImlhdCI6MTc3NTkzNDgwMywiZXhwIjoxODA3NDcwODAzfQ.owIqb6_Dc2-wA9iUiisiOr-tnhUgbBW37ivTPCWCA74";

const GENERIC_DENY_MESSAGE =
  "This account is not allowed to access Admin Backoffice. Please contact the owner.";
const GENERIC_QR_ERROR = "Unable to complete QR login right now. Please try again.";
const QR_FEATURE_ENABLED = process.env.NEXT_PUBLIC_ADMIN_QR_LOGIN_ENABLED !== "false";
const QR_POLL_MS = Number(process.env.NEXT_PUBLIC_ADMIN_QR_LOGIN_POLL_MS ?? "2000");

type QrChallenge = {
  id: string;
  token: string;
  nonce: string;
  status: string;
  expiresAt: string;
  qrPayload: string;
  qrDeepLink: string;
  pollIntervalMs: number;
};

type QrChallengeResponse = {
  challenge: QrChallenge;
};

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
  const [authMode, setAuthMode] = useState<"password" | "qr">("password");
  const [isCreatingQr, setIsCreatingQr] = useState(false);
  const [isExchangingQr, setIsExchangingQr] = useState(false);
  const [qrChallenge, setQrChallenge] = useState<QrChallenge | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrStatusMessage, setQrStatusMessage] = useState<string | null>(null);
  const [qrErrorMessage, setQrErrorMessage] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const isCompletingRef = useRef(false);

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

  const expiresInSeconds = useMemo(() => {
    if (!qrChallenge) return 0;
    const diff = Date.parse(qrChallenge.expiresAt) - clockNow;
    return Math.max(0, Math.floor(diff / 1000));
  }, [clockNow, qrChallenge]);

  useEffect(() => {
    if (authMode !== "qr" || !qrChallenge) return;

    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [authMode, qrChallenge]);

  const createQrChallenge = useCallback(async () => {
    if (isCreatingQr) return;

    setQrErrorMessage(null);
    setQrStatusMessage("Preparing secure QR challenge...");
    setIsCreatingQr(true);
    setQrImageUrl(null);

    try {
      const response = await fetch("/api/auth/qr/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceLabel: "admin-browser",
        }),
        cache: "no-store",
      });

      const body = (await response.json().catch(() => ({}))) as QrChallengeResponse & { error?: string };
      if (!response.ok || !body.challenge) {
        setQrErrorMessage(body.error ?? GENERIC_QR_ERROR);
        setQrStatusMessage(null);
        return;
      }

      const imageUrl = await QRCode.toDataURL(body.challenge.qrPayload, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      setQrChallenge(body.challenge);
      setQrImageUrl(imageUrl);
      setClockNow(Date.now());
      setQrStatusMessage("Scan this QR in your secured user app, then tap Confirm.");
    } catch (error) {
      if (error instanceof Error) {
        setQrErrorMessage(error.message || GENERIC_QR_ERROR);
      } else {
        setQrErrorMessage(GENERIC_QR_ERROR);
      }
      setQrStatusMessage(null);
    } finally {
      setIsCreatingQr(false);
    }
  }, [isCreatingQr]);

  const completeQrLogin = useCallback(
    async (challenge: QrChallenge) => {
      if (isCompletingRef.current) return;
      isCompletingRef.current = true;
      setIsExchangingQr(true);
      setQrErrorMessage(null);
      setQrStatusMessage("Approval received. Completing secure sign-in...");

      try {
        const exchangeRes = await fetch(`/api/auth/qr/challenge/${challenge.id}/exchange`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: challenge.token,
            nonce: challenge.nonce,
          }),
          cache: "no-store",
        });

        const exchangeBody = (await exchangeRes.json().catch(() => ({}))) as {
          exchange?: { tokenHash: string; type: "magiclink" };
          error?: string;
        };

        if (!exchangeRes.ok || !exchangeBody.exchange?.tokenHash) {
          setQrErrorMessage(exchangeBody.error ?? GENERIC_QR_ERROR);
          setQrStatusMessage(null);
          return;
        }

        const supabase = createBrowserSupabase();
        const { error } = await supabase.auth.verifyOtp({
          token_hash: exchangeBody.exchange.tokenHash,
          type: exchangeBody.exchange.type,
        });

        if (error) {
          setQrErrorMessage(error.message || GENERIC_QR_ERROR);
          setQrStatusMessage(null);
          return;
        }

        const allowed = await hasAdminAccess();
        if (!allowed) {
          await supabase.auth.signOut();
          setQrErrorMessage(GENERIC_DENY_MESSAGE);
          setQrStatusMessage(null);
          return;
        }

        startTransition(() => {
          router.replace("/");
          router.refresh();
        });
      } catch (error) {
        if (error instanceof Error) {
          setQrErrorMessage(error.message || GENERIC_QR_ERROR);
        } else {
          setQrErrorMessage(GENERIC_QR_ERROR);
        }
        setQrStatusMessage(null);
      } finally {
        setIsExchangingQr(false);
        isCompletingRef.current = false;
      }
    },
    [router],
  );

  useEffect(() => {
    if (authMode !== "qr" || !QR_FEATURE_ENABLED) return;
    if (isCheckingSession || qrChallenge || isCreatingQr || qrErrorMessage) return;
    void createQrChallenge();
  }, [authMode, createQrChallenge, isCheckingSession, isCreatingQr, qrChallenge, qrErrorMessage]);

  useEffect(() => {
    if (authMode !== "qr" || !qrChallenge || isCreatingQr || isExchangingQr) return;

    let disposed = false;
    const pollMs =
      Number.isFinite(qrChallenge.pollIntervalMs) && qrChallenge.pollIntervalMs >= 500
        ? qrChallenge.pollIntervalMs
        : QR_POLL_MS;

    const poll = async () => {
      if (disposed || isCompletingRef.current) return;

      try {
        const response = await fetch(
          `/api/auth/qr/challenge/${qrChallenge.id}?token=${encodeURIComponent(qrChallenge.token)}&nonce=${encodeURIComponent(
            qrChallenge.nonce,
          )}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const body = (await response.json().catch(() => ({}))) as {
          challenge?: {
            status: string;
            approvedByEmail?: string | null;
            rejectedReason?: string | null;
          };
          error?: string;
        };

        if (!response.ok || !body.challenge) {
          setQrErrorMessage(body.error ?? GENERIC_QR_ERROR);
          setQrStatusMessage(null);
          return;
        }

        if (body.challenge.status === "approved") {
          setQrStatusMessage(
            body.challenge.approvedByEmail
              ? `Approved by ${body.challenge.approvedByEmail}. Finalizing login...`
              : "Approval received. Finalizing login...",
          );
          await completeQrLogin(qrChallenge);
          return;
        }

        if (body.challenge.status === "rejected") {
          setQrErrorMessage(body.challenge.rejectedReason ?? "QR login was rejected in your app.");
          setQrStatusMessage(null);
          return;
        }

        if (body.challenge.status === "expired") {
          setQrErrorMessage("QR challenge expired. Please refresh and scan again.");
          setQrStatusMessage(null);
          return;
        }

        if (body.challenge.status === "consumed") {
          setQrErrorMessage("QR challenge has already been used.");
          setQrStatusMessage(null);
        }
      } catch (error) {
        if (error instanceof Error) {
          setQrErrorMessage(error.message || GENERIC_QR_ERROR);
        } else {
          setQrErrorMessage(GENERIC_QR_ERROR);
        }
        setQrStatusMessage(null);
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), pollMs);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [authMode, completeQrLogin, isCreatingQr, isExchangingQr, qrChallenge]);

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
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Invalid environment configuration")) {
          setErrorMessage("System configuration is incomplete. Please contact administrator.");
          return;
        }

        setErrorMessage(error.message || "Unable to sign in right now. Please try again.");
        return;
      }

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
              <>
                <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
                  <button
                    aria-selected={authMode === "password"}
                    className={`auth-mode-btn ${authMode === "password" ? "is-active" : ""}`}
                    disabled={isSubmitting || isNavigating || isExchangingQr}
                    onClick={() => {
                      setAuthMode("password");
                      setQrErrorMessage(null);
                      setQrStatusMessage(null);
                    }}
                    role="tab"
                    type="button"
                  >
                    PASSWORD
                  </button>
                  <button
                    aria-selected={authMode === "qr"}
                    className={`auth-mode-btn ${authMode === "qr" ? "is-active" : ""}`}
                    disabled={!QR_FEATURE_ENABLED || isSubmitting || isNavigating || isExchangingQr}
                    onClick={() => {
                      setAuthMode("qr");
                      setErrorMessage(null);
                    }}
                    role="tab"
                    type="button"
                  >
                    LOG IN WITH QR
                  </button>
                </div>

                {authMode === "password" ? (
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
                ) : (
                  <div className="qr-login-panel" role="tabpanel">
                    <p className="qr-helper-text">Scan QR with your approved user app and tap confirm.</p>

                    {qrImageUrl ? (
                      <div className="qr-canvas-wrap">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="QR login challenge" className="qr-canvas" src={qrImageUrl} />
                      </div>
                    ) : (
                      <div className="qr-canvas-placeholder">
                        {isCreatingQr ? "Generating QR..." : "QR is not ready yet."}
                      </div>
                    )}

                    {qrChallenge ? (
                      <div className="qr-challenge-meta">
                        <p>
                          Ref: <code>{qrChallenge.id.slice(0, 8).toUpperCase()}</code>
                        </p>
                        <p>Expires in: {expiresInSeconds}s</p>
                      </div>
                    ) : null}

                    {qrStatusMessage ? <p className="info-banner text-sm">{qrStatusMessage}</p> : null}
                    {qrErrorMessage ? <p className="error-banner text-sm">{qrErrorMessage}</p> : null}

                    <div className="qr-actions">
                      <button
                        className="login-btn qr-refresh-btn"
                        disabled={isCreatingQr || isExchangingQr || isNavigating}
                        onClick={() => {
                          setQrErrorMessage(null);
                          setQrStatusMessage(null);
                          setQrChallenge(null);
                          setQrImageUrl(null);
                          void createQrChallenge();
                        }}
                        type="button"
                      >
                        {isCreatingQr ? "REFRESHING..." : "REFRESH QR"}
                      </button>
                      {qrChallenge?.qrDeepLink ? (
                        <a className="qr-open-app-link" href={qrChallenge.qrDeepLink}>
                          Open in App
                        </a>
                      ) : null}
                    </div>
                  </div>
                )}
              </>
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
