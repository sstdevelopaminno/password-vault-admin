import { createHash, randomBytes } from "crypto";

export const QR_LOGIN_ACTION = "admin_qr_login_v1";

export const QR_CHALLENGE_STATUSES = ["pending", "approved", "rejected", "expired", "consumed"] as const;

export type QrChallengeStatus = (typeof QR_CHALLENGE_STATUSES)[number];

export function generateQrSecret(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashQrSecret(secret: string) {
  return createHash("sha256").update(secret).digest("base64url");
}

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return request.headers.get("x-real-ip")?.trim() ?? null;
}

export function getClientUserAgent(request: Request) {
  return request.headers.get("user-agent")?.trim() ?? null;
}

export function buildQrPayload(input: {
  challengeId: string;
  challengeToken: string;
  nonce: string;
  expiresAtIso: string;
  origin: string;
  scheme: string;
}) {
  const serialized = JSON.stringify({
    v: 1,
    action: QR_LOGIN_ACTION,
    challengeId: input.challengeId,
    challengeToken: input.challengeToken,
    nonce: input.nonce,
    expiresAt: input.expiresAtIso,
    origin: input.origin,
  });

  const deepLink = `${input.scheme}?payload=${encodeURIComponent(serialized)}`;
  return { serialized, deepLink };
}

export function isIsoTimestampExpired(isoString: string) {
  return Date.parse(isoString) <= Date.now();
}
