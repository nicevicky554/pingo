-- PINGO — group topics, plus protection for the group owner role.
--
-- Topics are lightweight per-group threads. They belong to a conversation and
-- only group admins can create or remove them. A message may reference a
-- topic, and a trigger guarantees the topic belongs to the same conversation
-- (RLS alone cannot compare two new-row columns across tables).

create table if not exists public.conversation_topics (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists conversation_topics_title_key
  on public.conversation_topics (conversation_id, lower(btrim(title)));
create index if not exists conversation_topics_conversation_idx
  on public.conversation_topics (conversation_id, created_at);

alter table public.conversation_topics enable row level security;

drop policy if exists topics_select on public.conversation_topics;
create policy topics_select on public.conversation_topics for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists topics_insert on public.conversation_topics;
create policy topics_insert on public.conversation_topics for insert to authenticated
  with check (
    public.is_conversation_admin(conversation_id)
    and created_by = auth.uid()
  );

drop policy if exists topics_update on public.conversation_topics;
create policy topics_update on public.conversation_topics for update to authenticated
  using (public.is_conversation_admin(conversation_id))
  with check (public.is_conversation_admin(conversation_id));

drop policy if exists topics_delete on public.conversation_topics;
create policy topics_delete on public.conversation_topics for delete to authenticated
  using (public.is_conversation_admin(conversation_id));

alter table public.messages
  add column if not exists topic_id uuid
  references public.conversation_topics(id) on delete set null;

create index if not exists messages_topic_idx
  on public.messages (conversation_id, topic_id, created_at);

create or replace function public.pingo_validate_message_topic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.topic_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.conversation_topics t
    where t.id = new.topic_id
      and t.conversation_id = new.conversation_id
  ) then
    raise exception 'The topic does not belong to this conversation.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_message_topic on public.messages;
create trigger validate_message_topic
  before insert or update of topic_id, conversation_id on public.messages
  for each row execute function public.pingo_validate_message_topic();

-- Only the owner (or an application admin) may transfer or remove the owner
-- role. Admins can promote and demote ordinary members.
create or replace function public.pingo_protect_group_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner' and new.role is distinct from 'owner' then
    if auth.uid() is null or (auth.uid() <> old.user_id and not public.is_admin()) then
      raise exception 'The group owner cannot be demoted.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_group_owner on public.conversation_members;
create trigger protect_group_owner
  before update of role on public.conversation_members
  for each row execute function public.pingo_protect_group_owner();
