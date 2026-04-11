# Legacy API Map (from password-vault)

Source app: `E:\password-vault`

This map is frozen as a migration reference so the new admin app can integrate safely without editing the old app.

## Admin Endpoints
- `GET /api/admin/stats`
  - Returns dashboard counters: `totalUsers`, `activeUsers`, `adminUsers`, `pendingApprovals`, `reviewedApprovals24h`, `recentSensitiveActions24h`.

- `GET /api/admin/users?limit=&cursor=`
  - Returns paginated user profiles.
- `PATCH /api/admin/users`
  - Body: `{ userId, role?, status?, fullName? }`.
- `DELETE /api/admin/users?userId=`
  - Deletes auth user (self-delete blocked).

- `GET /api/admin/approvals?limit=&cursor=`
  - Returns pending approval requests.
- `POST /api/admin/approvals`
  - Body: `{ userId, approved, rejectReason? }`.

- `GET /api/admin/audit-logs?format=json|csv&limit=&cursor=&q=&action=&from=&to=`
  - Returns logs (json pagination or csv export).

- `POST /api/admin/view-user-vault`
  - Body: `{ targetUserId, limit?, cursor? }`.
  - PIN assertion required in legacy app.

## Shared Identity Endpoint
- `GET /api/profile/me`
  - Returns role/status/session profile of current user.

## Migration Strategy
- Phase 1: Keep old endpoints as reference contract.
- Phase 2: Re-implement admin endpoints directly in new app against Supabase.
- Phase 3: Remove cross-app dependency where possible.
