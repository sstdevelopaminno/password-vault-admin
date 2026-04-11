# Admin Backoffice UI Plan

## Goal
Build `password-vault-admin` as a desktop/tablet operations center for support agents and IT staff.

## Target Device
- Primary: desktop
- Secondary: tablet
- Mobile: limited mode only (informational warning screen)

## Core Workspaces
- Service Desk: user support requests and incident workflows
- Audit & Compliance: security/audit traceability
- Billing Operations: service plans, payment status, collection flows
- Role Control: clear authority boundaries by role

## Role Boundary
- Approver: approve/reject queued requests
- Admin: user operations, support workflows, non-destructive administration
- Owner (Super Admin): destructive actions, policy overrides, billing authority

## Internationalization
- Default locale detection from request headers (`th` / `en`)
- Thai-first support for internal operations teams
- Message dictionary centralized in `src/lib/i18n.ts`

## API Migration Order
1. stats (completed)
2. audit-logs (completed)
3. users (completed v1: GET/PATCH/DELETE)
4. approvals
5. view-user-vault

## Non-Disruptive Principle
- Keep `password-vault` user project untouched.
- Migrate admin capabilities in `password-vault-admin` only.
- Keep API contract parity and provide `native/legacy` mode switch.
