# Password Vault Admin

Standalone admin app for Password Vault.

This repository is intentionally separated from `password-vault` (user app) to reduce deployment risk, avoid accidental coupling, and allow independent release cycles.

## Goals
- Keep user app untouched.
- Deploy admin app to a separate Vercel project.
- Reuse the same Supabase project safely.
- Preserve legacy API contract references for controlled migration.

## Quick Start
1. Install dependencies.
```bash
npm install
```
2. Prepare env file.
```bash
copy .env.example .env.local
```
3. Start dev server.
```bash
npm run dev
```

## Bootstrap Super Admin
1. Ensure `.env.local` includes:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Optional: set fixed bootstrap values in `.env.local`:
   - `BOOTSTRAP_SUPER_ADMIN_EMAIL`
   - `BOOTSTRAP_SUPER_ADMIN_PASSWORD`
   - `BOOTSTRAP_SUPER_ADMIN_AUTH_CODE`
3. Run:
```bash
npm run bootstrap:super-admin
```
The script creates or updates the account, forces profile role to `super_admin`, sets status to `active`, and prints email/password/authority code for secure handover.

## Important Files
- `docs/ENV_VERCEL_SUPABASE_CHECKLIST.md`
- `docs/LEGACY_PASSWORD_VAULT_API_MAP.md`
- `docs/QR_LOGIN_INTEGRATION.md`
- `src/lib/env.ts`
- `src/lib/auth.ts`

## Deployment
Create a **new** Vercel project (do not reuse the existing user app project), connect this repository, and configure env vars from `.env.example`.
