# Admin QR Login Integration

This document describes how to connect the **user app (project 1)** to this **admin app** for QR-based admin login approval.

## Overview
1. Admin browser opens `/login` and clicks `LOG IN WITH QR`.
2. Admin app creates a short-lived challenge and renders a QR payload.
3. User app scans QR, verifies logged-in user identity, and asks for confirmation.
4. User app backend calls admin integration endpoint with:
   - integration secret
   - scanned challenge data
   - current user access token
5. Admin browser polling sees `approved` and exchanges the challenge for a Supabase session.
6. Admin browser redirects into admin dashboard automatically.

## Required Environment Variables (Admin App)
- `NEXT_PUBLIC_ADMIN_QR_LOGIN_ENABLED=true`
- `NEXT_PUBLIC_ADMIN_QR_LOGIN_POLL_MS=2000`
- `NEXT_PUBLIC_ADMIN_QR_SCHEME=password-vault://admin-qr-login`
- `ADMIN_QR_LOGIN_TTL_SECONDS=180`
- `ADMIN_QR_LOGIN_INTEGRATION_SECRET=<long-random-secret>`

## Integration Endpoint
`POST /api/integrations/qr-login/approve`

Headers:
- `Authorization: Bearer <ADMIN_QR_LOGIN_INTEGRATION_SECRET>`
- `Content-Type: application/json`

JSON body:
```json
{
  "challengeId": "uuid-from-qr",
  "challengeToken": "secret-from-qr",
  "nonce": "nonce-from-qr",
  "userAccessToken": "supabase-access-token-of-confirming-user",
  "decision": "approve",
  "appInstanceId": "optional-device-or-install-id"
}
```

Notes:
- `decision` can be `approve` or `reject`.
- Only users with admin-allowed roles (`approver`, `admin`, `super_admin` by default) and `active` status can approve.
- Expired or already used challenges are rejected automatically.

## QR Payload Contract
The admin app embeds a JSON payload in QR:
```json
{
  "v": 1,
  "action": "admin_qr_login_v1",
  "challengeId": "...",
  "challengeToken": "...",
  "nonce": "...",
  "expiresAt": "ISO-8601",
  "origin": "https://password-vault-admin.vercel.app"
}
```

The user app should:
1. Validate `action === "admin_qr_login_v1"`.
2. Validate `expiresAt` is still in the future.
3. Ask user for explicit confirm.
4. Send approval request from **trusted backend** (not from public client with embedded secret).

## Security Checklist
- Keep `ADMIN_QR_LOGIN_INTEGRATION_SECRET` server-side only.
- Rotate integration secret on schedule.
- Use HTTPS only in production.
- Keep QR TTL short (default `180s`).
- Require explicit user confirmation before sending `approve`.
- Log and monitor `admin_qr_login_*` audit events.
