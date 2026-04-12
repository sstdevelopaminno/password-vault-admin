-- OTP hardening: support unauthenticated flows + attempt limiting
alter table public.otp_requests alter column user_id drop not null;
alter table public.otp_requests
  add column if not exists attempts_count integer not null default 0;
create index if not exists idx_otp_requests_email_purpose_created
  on public.otp_requests (email_target, purpose, created_at desc);
create index if not exists idx_otp_requests_expires_at
  on public.otp_requests (expires_at);
