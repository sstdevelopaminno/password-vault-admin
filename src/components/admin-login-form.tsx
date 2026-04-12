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
const GENERIC_ACCESS_CHECK_ERROR = "Unable to verify admin access right now. Please try again.";
const GENERIC_QR_TIMEOUT_MESSAGE = "QR login timed out. Please start QR login again.";
const QR_FEATURE_ENABLED = process.env.NEXT_PUBLIC_ADMIN_QR_LOGIN_ENABLED !== "false";
const QR_POLL_MS = Number(process.env.NEXT_PUBLIC_ADMIN_QR_LOGIN_POLL_MS ?? "2000");
const QR_SESSION_TIMEOUT_SECONDS_RAW = Number(process.env.NEXT_PUBLIC_ADMIN_QR_SESSION_TIMEOUT_SECONDS ?? "120");
const QR_SESSION_TIMEOUT_SECONDS = Number.isFinite(QR_SESSION_TIMEOUT_SECONDS_RAW)
  ? Math.min(600, Math.max(30, Math.floor(QR_SESSION_TIMEOUT_SECONDS_RAW)))
  : 120;
const QR_DEBUG_ENABLED = process.env.NEXT_PUBLIC_ADMIN_QR_LOGIN_DEBUG === "true";
const ACCESS_CHECK_MAX_RETRIES = 8;
const ACCESS_CHECK_RETRY_BASE_MS = 300;
const QR_SESSION_TIMEOUT_MS = QR_SESSION_TIMEOUT_SECONDS * 1000;

function qrDebug(event: string, details?: Record<string, unknown>) {
  if (!QR_DEBUG_ENABLED || typeof window === "undefined") return;
  console.info(
    "[QR_LOGIN]",
    JSON.stringify({
      at: new Date().toISOString(),
      event,
      ...(details ?? {}),
    }),
  );
}

type QrChallenge = {
  id: string;
  token: string;
  nonce: string;
  status: string;
  expiresAt: string;
  qrPayload: string;
  qrDeepLink: string;
  pollIntervalMs: number;
  serverNow?: string;
};

type QrErrorResponse = {
  error?: string;
  code?: string;
  requestId?: string;
  retryAfterSeconds?: number;
};

type QrChallengeApiResponse = QrErrorResponse & {
  challenge?: QrChallenge;
};

type AdminAccessCheckResponse = QrErrorResponse & {
  ok?: boolean;
  profile?: {
    id: string;
    role: string;
    status: string;
  };
};

type AccessCheckResult = {
  ok: boolean;
  status: number;
  error: string | null;
  requestId: string | null;
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
  const [qrRefreshCooldownSeconds, setQrRefreshCooldownSeconds] = useState(0);
  const [qrSessionStartedAtMs, setQrSessionStartedAtMs] = useState<number | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const isCompletingRef = useRef(false);
  const isCreatingQrRef = useRef(false);
  const qrCreateRequestIdRef = useRef(0);
  const activeQrKeyRef = useRef<string | null>(null);
  const pollingAbortRef = useRef<AbortController | null>(null);
  const lastPolledStatusRef = useRef<string | null>(null);

  const resetQrFlowState = useCallback(() => {
    activeQrKeyRef.current = null;
    pollingAbortRef.current?.abort();
    pollingAbortRef.current = null;
    qrCreateRequestIdRef.current += 1;
    isCreatingQrRef.current = false;
    setIsCreatingQr(false);
    setQrChallenge(null);
    setQrImageUrl(null);
    lastPolledStatusRef.current = null;
  }, []);

  const switchToPasswordMode = useCallback(
    (message?: string | null) => {
      resetQrFlowState();
      setQrStatusMessage(null);
      setQrErrorMessage(null);
      setQrRefreshCooldownSeconds(0);
      setQrSessionStartedAtMs(null);
      setAuthMode("password");
      if (message) {
        setErrorMessage(message);
      }
    },
    [resetQrFlowState],
  );

  const checkAdminAccess = useCallback(async (accessToken?: string | null): Promise<AccessCheckResult> => {
    let attempts = 0;
    let lastResult: AccessCheckResult = {
      ok: false,
      status: 0,
      error: null,
      requestId: null,
    };

    while (attempts < ACCESS_CHECK_MAX_RETRIES) {
      attempts += 1;
      const response = await fetch("/api/admin/access", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
      });

      const body = (await response.json().catch(() => ({}))) as AdminAccessCheckResponse;
      const current: AccessCheckResult = {
        ok: response.ok && body.ok === true,
        status: response.status,
        error: body.error ?? null,
        requestId: body.requestId ?? null,
      };

      if (current.ok) {
        return current;
      }

      lastResult = current;
      if (response.status !== 401 || attempts >= ACCESS_CHECK_MAX_RETRIES) {
        return current;
      }

      await new Promise((resolve) => window.setTimeout(resolve, attempts * ACCESS_CHECK_RETRY_BASE_MS));
    }

    return lastResult;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkCurrentSession() {
      const result = await checkAdminAccess().catch(
        () =>
          ({
            ok: false,
            status: 0,
            error: null,
            requestId: null,
          }) satisfies AccessCheckResult,
      );
      if (cancelled) return;

      if (result.ok) {
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
  }, [checkAdminAccess, router]);

  const syncServerClock = useCallback((serverNowIso?: string) => {
    if (!serverNowIso) return null;
    const parsedServerTime = Date.parse(serverNowIso);
    if (!Number.isFinite(parsedServerTime)) return null;

    const offset = parsedServerTime - Date.now();
    setServerClockOffsetMs(offset);
    setClockNow(Date.now() + offset);
    return offset;
  }, []);

  const normalizeCooldownSeconds = useCallback((value: unknown) => {
    if (value == null) return 0;
    const parsed =
      typeof value === "number"
        ? value
        : Number.parseInt(typeof value === "string" ? value : String(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(60, Math.max(1, Math.ceil(parsed)));
  }, []);

  const applyRefreshCooldown = useCallback(
    (seconds: unknown) => {
      const normalized = normalizeCooldownSeconds(seconds);
      if (normalized <= 0) return 0;
      setQrRefreshCooldownSeconds((previous) => Math.max(previous, normalized));
      return normalized;
    },
    [normalizeCooldownSeconds],
  );

  const resolveRetryAfterSeconds = useCallback(
    (response: Response, body?: QrErrorResponse) => {
      const fromBody = normalizeCooldownSeconds(body?.retryAfterSeconds);
      if (fromBody > 0) return fromBody;
      const fromHeader = normalizeCooldownSeconds(response.headers.get("retry-after"));
      if (fromHeader > 0) return fromHeader;
      return 0;
    },
    [normalizeCooldownSeconds],
  );

  useEffect(() => {
    if (qrRefreshCooldownSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setQrRefreshCooldownSeconds((previous) => {
        if (previous <= 1) return 0;
        return previous - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [qrRefreshCooldownSeconds]);

  const expiresInSeconds = useMemo(() => {
    if (!qrChallenge) return 0;
    const diff = Date.parse(qrChallenge.expiresAt) - clockNow;
    return Math.max(0, Math.floor(diff / 1000));
  }, [clockNow, qrChallenge]);

  useEffect(() => {
    if (authMode !== "qr" || !qrChallenge) return;

    const timer = window.setInterval(() => {
      setClockNow(Date.now() + serverClockOffsetMs);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [authMode, qrChallenge, serverClockOffsetMs]);

  const createQrChallenge = useCallback(async () => {
    if (isCreatingQrRef.current) return;

    const requestId = ++qrCreateRequestIdRef.current;
    isCreatingQrRef.current = true;
    qrDebug("challenge.create.start", { requestSerial: requestId });

    setErrorMessage(null);
    setQrErrorMessage(null);
    setQrStatusMessage("Preparing secure QR challenge...");
    setIsCreatingQr(true);
    setQrSessionStartedAtMs(Date.now());
    setQrImageUrl(null);
    activeQrKeyRef.current = null;
    pollingAbortRef.current?.abort();
    pollingAbortRef.current = null;

    try {
      const response = await fetch("/api/auth/qr/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceLabel: "admin-browser",
        }),
        cache: "no-store",
      });

      if (requestId !== qrCreateRequestIdRef.current) return;

      const body = (await response.json().catch(() => ({}))) as QrChallengeApiResponse;
      if (!response.ok || !body.challenge) {
        const retryAfterSeconds = resolveRetryAfterSeconds(response, body);
        if (response.status === 429) {
          const cooldown = applyRefreshCooldown(retryAfterSeconds || 10);
          setQrErrorMessage(`Too many QR requests. Please wait ${cooldown}s then refresh QR again.`);
          qrDebug("challenge.create.rate_limited", {
            requestSerial: requestId,
            status: response.status,
            retryAfterSeconds: cooldown,
            requestId: body.requestId,
          });
        } else {
          setQrErrorMessage(body.error ?? GENERIC_QR_ERROR);
          qrDebug("challenge.create.failed", {
            requestSerial: requestId,
            status: response.status,
            requestId: body.requestId,
            error: body.error ?? GENERIC_QR_ERROR,
          });
        }
        setQrStatusMessage(null);
        return;
      }

      syncServerClock(body.challenge.serverNow);

      const imageUrl = await QRCode.toDataURL(body.challenge.qrPayload, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      if (requestId !== qrCreateRequestIdRef.current) return;

      setQrChallenge(body.challenge);
      lastPolledStatusRef.current = null;
      setQrImageUrl(imageUrl);
      setQrStatusMessage("Scan this QR in your secured user app, then tap Confirm.");
      setQrRefreshCooldownSeconds(0);
      qrDebug("challenge.create.success", {
        requestSerial: requestId,
        challengeRef: body.challenge.id.slice(0, 8).toUpperCase(),
        expiresAt: body.challenge.expiresAt,
      });
    } catch (error) {
      if (requestId !== qrCreateRequestIdRef.current) return;
      if (error instanceof Error) {
        setQrErrorMessage(error.message || GENERIC_QR_ERROR);
        qrDebug("challenge.create.error", {
          requestSerial: requestId,
          message: error.message || GENERIC_QR_ERROR,
        });
      } else {
        setQrErrorMessage(GENERIC_QR_ERROR);
        qrDebug("challenge.create.error", {
          requestSerial: requestId,
          message: GENERIC_QR_ERROR,
        });
      }
      setQrStatusMessage(null);
    } finally {
      if (requestId === qrCreateRequestIdRef.current) {
        isCreatingQrRef.current = false;
        setIsCreatingQr(false);
      }
    }
  }, [applyRefreshCooldown, resolveRetryAfterSeconds, syncServerClock]);

  const completeQrLogin = useCallback(
    async (challenge: QrChallenge) => {
      if (isCompletingRef.current) return;
      isCompletingRef.current = true;
      qrDebug("challenge.exchange.start", {
        challengeRef: challenge.id.slice(0, 8).toUpperCase(),
      });
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
        } & QrErrorResponse;

        if (!exchangeRes.ok || !exchangeBody.exchange?.tokenHash) {
          setQrErrorMessage(exchangeBody.error ?? GENERIC_QR_ERROR);
          setQrStatusMessage(null);
          if (exchangeRes.status === 409) {
            switchToPasswordMode(exchangeBody.error ?? GENERIC_QR_ERROR);
          }
          qrDebug("challenge.exchange.failed", {
            challengeRef: challenge.id.slice(0, 8).toUpperCase(),
            status: exchangeRes.status,
            requestId: exchangeBody.requestId,
            error: exchangeBody.error ?? GENERIC_QR_ERROR,
          });
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
          setQrChallenge(null);
          setQrImageUrl(null);
          qrDebug("challenge.exchange.verify_otp_failed", {
            challengeRef: challenge.id.slice(0, 8).toUpperCase(),
            message: error.message || GENERIC_QR_ERROR,
          });
          return;
        }

        const {
          data: { session: qrSession },
        } = await supabase.auth.getSession();
        const access = await checkAdminAccess(qrSession?.access_token ?? null);
        if (!access.ok) {
          await supabase.auth.signOut({ scope: "local" });
          const accessErrorMessage =
            access.status === 403
              ? GENERIC_DENY_MESSAGE
              : access.status === 401
                ? GENERIC_QR_TIMEOUT_MESSAGE
                : GENERIC_ACCESS_CHECK_ERROR;
          switchToPasswordMode(accessErrorMessage);
          qrDebug("challenge.exchange.denied", {
            challengeRef: challenge.id.slice(0, 8).toUpperCase(),
            status: access.status,
            requestId: access.requestId,
            error: access.error,
          });
          return;
        }

        qrDebug("challenge.exchange.success", {
          challengeRef: challenge.id.slice(0, 8).toUpperCase(),
        });
        startTransition(() => {
          router.replace("/");
          router.refresh();
        });
      } catch (error) {
        if (error instanceof Error) {
          switchToPasswordMode(error.message || GENERIC_QR_ERROR);
          qrDebug("challenge.exchange.error", {
            challengeRef: challenge.id.slice(0, 8).toUpperCase(),
            message: error.message || GENERIC_QR_ERROR,
          });
        } else {
          switchToPasswordMode(GENERIC_QR_ERROR);
          qrDebug("challenge.exchange.error", {
            challengeRef: challenge.id.slice(0, 8).toUpperCase(),
            message: GENERIC_QR_ERROR,
          });
        }
      } finally {
        setIsExchangingQr(false);
        isCompletingRef.current = false;
      }
    },
    [checkAdminAccess, router, switchToPasswordMode],
  );

  useEffect(() => {
    if (authMode !== "qr" || !qrSessionStartedAtMs || isExchangingQr) return;

    const elapsedMs = Date.now() - qrSessionStartedAtMs;
    const remainingMs = QR_SESSION_TIMEOUT_MS - elapsedMs;
    if (remainingMs <= 0) {
      qrDebug("challenge.session.timeout", { elapsedMs });
      switchToPasswordMode(GENERIC_QR_TIMEOUT_MESSAGE);
      return;
    }

    const timer = window.setTimeout(() => {
      qrDebug("challenge.session.timeout", { elapsedMs: Date.now() - qrSessionStartedAtMs });
      switchToPasswordMode(GENERIC_QR_TIMEOUT_MESSAGE);
    }, remainingMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [authMode, isExchangingQr, qrSessionStartedAtMs, switchToPasswordMode]);

  useEffect(() => {
    if (authMode !== "qr" || !qrChallenge || isCreatingQr || isExchangingQr) return;

    const challengeSnapshot = qrChallenge;
    const challengeKey = `${challengeSnapshot.id}:${challengeSnapshot.nonce}`;
    activeQrKeyRef.current = challengeKey;
    let disposed = false;
    let timer: number | null = null;
    const pollMs =
      Number.isFinite(challengeSnapshot.pollIntervalMs) && challengeSnapshot.pollIntervalMs >= 500
        ? challengeSnapshot.pollIntervalMs
        : QR_POLL_MS;
    qrDebug("challenge.poll.start", {
      challengeRef: challengeSnapshot.id.slice(0, 8).toUpperCase(),
      pollMs,
    });

    const poll = async () => {
      if (disposed || isCompletingRef.current || activeQrKeyRef.current !== challengeKey) return;

      const pollController = new AbortController();
      pollingAbortRef.current = pollController;
      let shouldScheduleNext = true;

      try {
        const response = await fetch(
          `/api/auth/qr/challenge/${challengeSnapshot.id}?token=${encodeURIComponent(challengeSnapshot.token)}&nonce=${encodeURIComponent(
            challengeSnapshot.nonce,
          )}`,
          {
            method: "GET",
            cache: "no-store",
            signal: pollController.signal,
          },
        );

        if (disposed || activeQrKeyRef.current !== challengeKey) return;

        const body = (await response.json().catch(() => ({}))) as {
          challenge?: {
            status: string;
            approvedByEmail?: string | null;
            rejectedReason?: string | null;
          };
          serverNow?: string;
        } & QrErrorResponse;

        syncServerClock(body.serverNow);

        if (!response.ok || !body.challenge) {
          setQrErrorMessage(body.error ?? GENERIC_QR_ERROR);
          setQrStatusMessage(null);
          qrDebug("challenge.poll.failed", {
            challengeRef: challengeSnapshot.id.slice(0, 8).toUpperCase(),
            status: response.status,
            requestId: body.requestId,
            error: body.error ?? GENERIC_QR_ERROR,
          });
          shouldScheduleNext = false;
          return;
        }

        if (lastPolledStatusRef.current !== body.challenge.status) {
          lastPolledStatusRef.current = body.challenge.status;
          qrDebug("challenge.poll.status", {
            challengeRef: challengeSnapshot.id.slice(0, 8).toUpperCase(),
            status: body.challenge.status,
          });
        }

        if (body.challenge.status === "approved") {
          shouldScheduleNext = false;
          setQrStatusMessage(
            body.challenge.approvedByEmail
              ? `Approved by ${body.challenge.approvedByEmail}. Finalizing login...`
              : "Approval received. Finalizing login...",
          );
          await completeQrLogin(challengeSnapshot);
          return;
        }

        if (body.challenge.status === "rejected") {
          shouldScheduleNext = false;
          switchToPasswordMode(body.challenge.rejectedReason ?? "QR login was rejected in your app.");
          return;
        }

        if (body.challenge.status === "expired") {
          shouldScheduleNext = false;
          qrDebug("challenge.poll.expired", {
            challengeRef: challengeSnapshot.id.slice(0, 8).toUpperCase(),
          });
          switchToPasswordMode(GENERIC_QR_TIMEOUT_MESSAGE);
          return;
        }

        if (body.challenge.status === "consumed") {
          shouldScheduleNext = false;
          switchToPasswordMode("QR challenge was already used. Please start QR login again.");
          return;
        }
      } catch (error) {
        if (pollController.signal.aborted) return;
        if (disposed || activeQrKeyRef.current !== challengeKey) return;

        if (error instanceof Error) {
          setQrErrorMessage(error.message || GENERIC_QR_ERROR);
          qrDebug("challenge.poll.error", {
            challengeRef: challengeSnapshot.id.slice(0, 8).toUpperCase(),
            message: error.message || GENERIC_QR_ERROR,
          });
        } else {
          setQrErrorMessage(GENERIC_QR_ERROR);
          qrDebug("challenge.poll.error", {
            challengeRef: challengeSnapshot.id.slice(0, 8).toUpperCase(),
            message: GENERIC_QR_ERROR,
          });
        }
        setQrStatusMessage(null);
        shouldScheduleNext = false;
      } finally {
        if (pollingAbortRef.current === pollController) {
          pollingAbortRef.current = null;
        }

        if (shouldScheduleNext && !disposed && !isCompletingRef.current && activeQrKeyRef.current === challengeKey) {
          timer = window.setTimeout(() => void poll(), pollMs);
        }
      }
    };

    void poll();

    return () => {
      disposed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      if (pollingAbortRef.current) {
        pollingAbortRef.current.abort();
        pollingAbortRef.current = null;
      }
      if (activeQrKeyRef.current === challengeKey) {
        activeQrKeyRef.current = null;
      }
      qrDebug("challenge.poll.stop", {
        challengeRef: challengeSnapshot.id.slice(0, 8).toUpperCase(),
      });
    };
  }, [authMode, completeQrLogin, isCreatingQr, isExchangingQr, qrChallenge, switchToPasswordMode, syncServerClock]);

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

      const {
        data: { session: passwordSession },
      } = await supabase.auth.getSession();
      const access = await checkAdminAccess(passwordSession?.access_token ?? null);
      if (!access.ok) {
        if (access.status === 403) {
          await supabase.auth.signOut({ scope: "local" });
          setErrorMessage(GENERIC_DENY_MESSAGE);
        } else {
          if (access.status === 401) {
            await supabase.auth.signOut({ scope: "local" });
          }
          setErrorMessage(GENERIC_ACCESS_CHECK_ERROR);
        }
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
                      switchToPasswordMode(null);
                      setErrorMessage(null);
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
                      if (authMode === "qr" && (isCreatingQr || !!qrChallenge)) return;
                      resetQrFlowState();
                      setAuthMode("qr");
                      setErrorMessage(null);
                      setQrErrorMessage(null);
                      setQrStatusMessage(null);
                      setQrRefreshCooldownSeconds(0);
                      setQrSessionStartedAtMs(Date.now());
                      void createQrChallenge();
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
                    {qrRefreshCooldownSeconds > 0 ? (
                      <p className="info-banner text-sm">
                        Rate limited. You can refresh QR again in {qrRefreshCooldownSeconds}s.
                      </p>
                    ) : null}
                    {qrErrorMessage ? <p className="error-banner text-sm">{qrErrorMessage}</p> : null}

                    <div className="qr-actions">
                      <button
                        className="login-btn qr-refresh-btn"
                        disabled={isCreatingQr || isExchangingQr || isNavigating || qrRefreshCooldownSeconds > 0}
                        onClick={() => {
                          qrDebug("challenge.refresh.click", {
                            cooldownSeconds: qrRefreshCooldownSeconds,
                          });
                          setErrorMessage(null);
                          setQrErrorMessage(null);
                          setQrStatusMessage(null);
                          setQrChallenge(null);
                          setQrImageUrl(null);
                          void createQrChallenge();
                        }}
                        type="button"
                      >
                        {isCreatingQr
                          ? "REFRESHING..."
                          : qrRefreshCooldownSeconds > 0
                            ? `WAIT ${qrRefreshCooldownSeconds}S`
                            : "REFRESH QR"}
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
