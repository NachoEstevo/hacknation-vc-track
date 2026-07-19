-- Anonymous free-tier usage limits.
--
-- Three independent pools per identity (a Supabase user — anonymous sessions
-- included — or a signed browser cookie), all inside one shared 48-hour
-- window that opens at the first consumption and resets everything together:
--
--   prospect_search    max 5     sourcing runs
--   profile_completion max 5     dossier generations/refreshes
--   chat_message       max 10    messages per chat
--
-- All access goes through the SECURITY DEFINER functions below; the tables
-- themselves are RLS-locked with no policies. Reservations are idempotent
-- (same key never double-charges) and refundable.

create table public.usage_limits (
  owner_id text primary key check (char_length(owner_id) between 3 and 120),
  window_started_at timestamptz not null default now(),
  window_ends_at timestamptz not null,
  searches_used integer not null default 0 check (searches_used >= 0),
  profiles_used integer not null default 0 check (profiles_used >= 0),
  updated_at timestamptz not null default now()
);

create table public.chat_usage (
  owner_id text not null references public.usage_limits(owner_id) on delete cascade,
  chat_id text not null check (char_length(chat_id) between 1 and 120),
  messages_used integer not null default 0 check (messages_used >= 0),
  primary key (owner_id, chat_id)
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null check (char_length(owner_id) between 3 and 120),
  kind text not null check (kind in ('prospect_search', 'profile_completion', 'chat_message')),
  chat_id text check (chat_id is null or char_length(chat_id) between 1 and 120),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 160),
  refunded boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create index usage_events_owner_created_idx
  on public.usage_events (owner_id, created_at desc);

alter table public.usage_limits enable row level security;
alter table public.chat_usage enable row level security;
alter table public.usage_events enable row level security;

revoke all on public.usage_limits from anon, authenticated;
revoke all on public.chat_usage from anon, authenticated;
revoke all on public.usage_events from anon, authenticated;

-- Current counters for an owner (zeroes once the window lapsed).
create or replace function public.usage_status_payload(p_owner text, p_chat_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.usage_limits;
  v_messages integer := 0;
begin
  select * into v_row
  from public.usage_limits
  where owner_id = p_owner and window_ends_at > now();

  if not found then
    return jsonb_build_object(
      'searchesUsed', 0,
      'profilesUsed', 0,
      'chatMessagesUsed', 0,
      'windowEndsAt', null
    );
  end if;

  if p_chat_id is not null then
    select coalesce(messages_used, 0) into v_messages
    from public.chat_usage
    where owner_id = p_owner and chat_id = p_chat_id;
    if not found then
      v_messages := 0;
    end if;
  end if;

  return jsonb_build_object(
    'searchesUsed', v_row.searches_used,
    'profilesUsed', v_row.profiles_used,
    'chatMessagesUsed', v_messages,
    'windowEndsAt', v_row.window_ends_at
  );
end;
$$;

-- Atomic check-and-reserve. Serialized per owner via an advisory lock so
-- two concurrent requests can never both take the last slot.
create or replace function public.usage_reserve(
  p_owner text,
  p_kind text,
  p_chat_id text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_used integer := 0;
  v_row public.usage_limits;
  v_event public.usage_events;
begin
  if p_kind not in ('prospect_search', 'profile_completion', 'chat_message') then
    raise exception 'unknown usage kind: %', p_kind;
  end if;
  if p_kind = 'chat_message' and p_chat_id is null then
    raise exception 'chat_message reservations require a chat id';
  end if;

  v_limit := case p_kind
    when 'prospect_search' then 5
    when 'profile_completion' then 5
    else 10
  end;

  perform pg_advisory_xact_lock(hashtextextended(p_owner, 42));

  select * into v_row from public.usage_limits where owner_id = p_owner;
  if found and v_row.window_ends_at <= now() then
    -- Window expired: every pool resets together.
    delete from public.usage_limits where owner_id = p_owner;
    delete from public.usage_events where owner_id = p_owner;
    v_row := null;
  end if;

  select * into v_event
  from public.usage_events
  where owner_id = p_owner and idempotency_key = p_idempotency_key;
  if found and not v_event.refunded then
    -- Replay (retry, double click): already charged, nothing more to pay.
    return jsonb_build_object('allowed', true) || public.usage_status_payload(p_owner, p_chat_id);
  end if;

  if v_row.owner_id is not null then
    if p_kind = 'prospect_search' then
      v_used := v_row.searches_used;
    elsif p_kind = 'profile_completion' then
      v_used := v_row.profiles_used;
    else
      select coalesce(messages_used, 0) into v_used
      from public.chat_usage
      where owner_id = p_owner and chat_id = p_chat_id;
      if not found then
        v_used := 0;
      end if;
    end if;
  end if;

  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'limit_reached')
      || public.usage_status_payload(p_owner, p_chat_id);
  end if;

  insert into public.usage_limits (owner_id, window_started_at, window_ends_at)
  values (p_owner, now(), now() + interval '48 hours')
  on conflict (owner_id) do nothing;

  if p_kind = 'prospect_search' then
    update public.usage_limits
    set searches_used = searches_used + 1, updated_at = now()
    where owner_id = p_owner;
  elsif p_kind = 'profile_completion' then
    update public.usage_limits
    set profiles_used = profiles_used + 1, updated_at = now()
    where owner_id = p_owner;
  else
    insert into public.chat_usage (owner_id, chat_id, messages_used)
    values (p_owner, p_chat_id, 1)
    on conflict (owner_id, chat_id)
      do update set messages_used = public.chat_usage.messages_used + 1;
  end if;

  insert into public.usage_events (owner_id, kind, chat_id, idempotency_key, refunded)
  values (p_owner, p_kind, p_chat_id, p_idempotency_key, false)
  on conflict (owner_id, idempotency_key)
    do update set refunded = false, kind = excluded.kind, chat_id = excluded.chat_id;

  return jsonb_build_object('allowed', true) || public.usage_status_payload(p_owner, p_chat_id);
end;
$$;

-- Gives one reservation back (failed run). Refunding twice is a no-op;
-- re-reserving the same key afterwards charges again.
create or replace function public.usage_refund(p_owner text, p_idempotency_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.usage_events;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner, 42));

  select * into v_event
  from public.usage_events
  where owner_id = p_owner and idempotency_key = p_idempotency_key and not refunded;
  if not found then
    return;
  end if;

  update public.usage_events set refunded = true where id = v_event.id;

  if v_event.kind = 'prospect_search' then
    update public.usage_limits
    set searches_used = greatest(0, searches_used - 1), updated_at = now()
    where owner_id = p_owner;
  elsif v_event.kind = 'profile_completion' then
    update public.usage_limits
    set profiles_used = greatest(0, profiles_used - 1), updated_at = now()
    where owner_id = p_owner;
  else
    update public.chat_usage
    set messages_used = greatest(0, messages_used - 1)
    where owner_id = p_owner and chat_id = v_event.chat_id;
  end if;
end;
$$;

-- Server-mediated only: the app's route handlers call these with the
-- service-role client. Clients could otherwise refund their own quota.
revoke all on function public.usage_status_payload(text, text) from public, anon, authenticated;
revoke all on function public.usage_reserve(text, text, text, text) from public, anon, authenticated;
revoke all on function public.usage_refund(text, text) from public, anon, authenticated;

grant execute on function public.usage_status_payload(text, text) to service_role;
grant execute on function public.usage_reserve(text, text, text, text) to service_role;
grant execute on function public.usage_refund(text, text) to service_role;
