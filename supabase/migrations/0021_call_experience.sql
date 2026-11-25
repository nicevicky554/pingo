-- PINGO — call experience: durable ringing, missed-call normalisation
--
-- The client used realtime broadcast as the only way to deliver an incoming
-- call invite. If that message arrived during a reconnect (or was dropped) the
-- callee saw the notification but no ringing banner. The caller's SDP offer is
-- now stored on the call row so the callee can recover the call from Postgres.
--
-- Nothing here drops data. Existing calls keep working; old rows simply have a
-- null caller_offer and cannot be recovered after the fact.

-- ===========================================================================
-- 1. DURABLE OFFER
-- ===========================================================================

alter table public.calls add column if not exists caller_offer jsonb;

comment on column public.calls.caller_offer is
  'SDP offer for a ringing 1:1 call. Readable only by the call initiator and participants through existing RLS.';

-- ===========================================================================
-- 2. MISSED-CALL NORMALISATION
-- ===========================================================================

-- Any call that reaches an "ended" state without ever being answered is a
-- missed call, not a completed incoming/outgoing call. This also closes the
-- participant rows so call logs and badges cannot keep them "invited".
create or replace function public.pingo_normalize_call_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ended'
     and new.answered_at is null
     and coalesce(new.duration_seconds, 0) = 0 then
    new.status := 'missed';
    if new.end_reason is null or new.end_reason = 'ended' then
      new.end_reason := 'cancelled';
    end if;
  end if;

  if new.status in ('missed', 'cancelled') then
    update public.call_participants
    set state = 'missed', left_at = coalesce(left_at, now())
    where call_id = new.id and state = 'invited';
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_call_end on public.calls;
create trigger normalize_call_end
  before update of status on public.calls
  for each row execute function public.pingo_normalize_call_end();

-- Called by clients on mount. It only touches calls the caller is allowed to
-- see, and only ones that have been ringing far longer than any client timer.
create or replace function public.pingo_expire_ringing_calls()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  expired integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.calls c
  set status = 'missed',
      ended_at = coalesce(c.ended_at, now()),
      end_reason = 'no_answer'
  where c.status = 'ringing'
    and c.started_at < now() - interval '60 seconds'
    and (
      c.initiator_id = uid
      or exists (
        select 1 from public.call_participants p
        where p.call_id = c.id and p.user_id = uid
      )
    );

  get diagnostics expired = row_count;
  return expired;
end;
$$;

revoke all on function public.pingo_expire_ringing_calls() from public;
grant execute on function public.pingo_expire_ringing_calls() to authenticated;

-- ===========================================================================
-- 3. LOOKUP SUPPORT
-- ===========================================================================

create index if not exists call_participants_invited_idx
  on public.call_participants (user_id, state);

-- Do not notify an invite that was already cancelled before the trigger ran.
create or replace function public.notify_call_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  call_row record;
begin
  select * into call_row from public.calls where id = new.call_id;
  if call_row is null
     or new.user_id = call_row.initiator_id
     or call_row.status <> 'ringing' then
    return new;
  end if;

  select coalesce(nullif(display_name, ''), username, 'Someone') as name, avatar_path
    into caller from public.profiles where id = call_row.initiator_id;

  insert into public.notifications (user_id, kind, title, body, data)
  values (
    new.user_id,
    'call',
    coalesce(caller.name, 'Incoming call'),
    'Incoming ' || call_row.kind || ' call',
    jsonb_build_object(
      'call_id', new.call_id,
      'conversation_id', call_row.conversation_id,
      'call_kind', call_row.kind,
      'caller_id', call_row.initiator_id
    )
  );
  return new;
end;
$$;
