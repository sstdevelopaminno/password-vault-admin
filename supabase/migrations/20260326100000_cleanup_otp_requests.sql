-- Remove legacy custom OTP storage and policies.
-- OTP flow is now handled by Supabase Auth directly.

DROP POLICY IF EXISTS "otp_owner_only" ON public.otp_requests;
DROP INDEX IF EXISTS public.idx_otp_requests_email_purpose_created;
DROP INDEX IF EXISTS public.idx_otp_requests_expires_at;
DROP TABLE IF EXISTS public.otp_requests;
DROP TYPE IF EXISTS public.otp_purpose;
