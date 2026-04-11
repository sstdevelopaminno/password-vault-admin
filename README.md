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

## Important Files
- `docs/ENV_VERCEL_SUPABASE_CHECKLIST.md`
- `docs/LEGACY_PASSWORD_VAULT_API_MAP.md`
- `src/lib/env.ts`
- `src/lib/auth.ts`

## Deployment
Create a **new** Vercel project (do not reuse the existing user app project), connect this repository, and configure env vars from `.env.example`.
