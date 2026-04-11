# ENV + Vercel + Supabase Checklist

## 1) New GitHub Repository
- Create a new repo: `password-vault-admin`.
- Push only code from `E:\password-vault-admin`.
- Do not include code from `E:\password-vault`.

## 2) New Vercel Project
- Create new Vercel project for this repo.
- Keep old Vercel project (`password-vault`) unchanged.
- Use separate domain/subdomain for admin (example: `admin.yourdomain.com`).

## 3) Required Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_ALLOWED_ROLES` (default: `approver,admin,super_admin`)

## 4) Security Controls
- Keep `SUPABASE_SERVICE_ROLE_KEY` only in server routes/actions.
- Never expose service role key to client bundles.
- Validate role and status on every admin-protected endpoint.
- Enable Vercel deployment protection for preview branches.

## 5) Supabase Preparation
- Reuse existing Supabase project.
- Verify `profiles.role` and `profiles.status` data integrity.
- Confirm RLS policies for admin operations and audit tables.

## 6) Rollout Steps
1. Deploy preview from admin repo.
2. Smoke test `/api/health` and `/api/whoami`.
3. Verify login and admin role access.
4. Promote to production.
5. Monitor runtime logs separately from user app.
