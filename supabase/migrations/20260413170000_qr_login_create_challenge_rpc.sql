-- Reduce QR challenge creation to a single DB roundtrip:
-- checks pending-per-IP rate limit and inserts challenge atomically.

create or replace function public.create_admin_qr_login_challenge(
  p_challenge_token_hash text,
  p_nonce text,
  p_requested_by_ip text,
  p_requested_user_agent text,
  p_requested_device_label text,
  p_expires_at timestamptz,
  p_metadata_json jsonb,
  p_max_pending integer default 8,
  p_window_seconds integer default 60
)
returns table (
  challenge_id uuid,
  challenge_nonce text,
  challenge_status text,
  challenge_expires_at timestamptz,
  rate_limited boolean,
  retry_after_seconds integer
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_oldest_pending timestamptz;
  v_pending_count integer := 0;
begin
  if p_requested_by_ip is not null then
    select min(created_at), count(*)
      into v_oldest_pending, v_pending_count
    from (
      select created_at
      from public.admin_qr_login_challenges
      where status = 'pending'
        and requested_by_ip = p_requested_by_ip
        and created_at >= (v_now - make_interval(secs => greatest(p_window_seconds, 1)))
      order by created_at asc
      limit greatest(p_max_pending, 1)
    ) as recent_pending;

    if v_pending_count >= greatest(p_max_pending, 1) then
      challenge_id := null;
      challenge_nonce := null;
      challenge_status := null;
      challenge_expires_at := null;
      rate_limited := true;
      retry_after_seconds := greatest(
        1,
        ceil(
          extract(
            epoch from ((v_oldest_pending + make_interval(secs => greatest(p_window_seconds, 1))) - v_now)
          )
        )::integer
      );
      return next;
      return;
    end if;
  end if;

  insert into public.admin_qr_login_challenges (
    challenge_token_hash,
    nonce,
    status,
    requested_by_ip,
    requested_user_agent,
    requested_device_label,
    expires_at,
    metadata_json
  )
  values (
    p_challenge_token_hash,
    p_nonce,
    'pending',
    p_requested_by_ip,
    p_requested_user_agent,
    p_requested_device_label,
    p_expires_at,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  returning
    id,
    nonce,
    status,
    expires_at
  into
    challenge_id,
    challenge_nonce,
    challenge_status,
    challenge_expires_at;

  rate_limited := false;
  retry_after_seconds := 0;
  return next;
end;
$$;
