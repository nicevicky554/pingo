-- PINGO — one active reaction per user per message
-- Keep the most recent existing reaction for each user/message pair, then
-- replace the composite primary key that allowed multiple emojis.
delete from public.message_reactions a
using public.message_reactions b
where a.message_id = b.message_id
  and a.user_id = b.user_id
  and (
    a.created_at < b.created_at
    or (a.created_at = b.created_at and a.ctid < b.ctid)
  );

alter table public.message_reactions
  drop constraint if exists message_reactions_pkey;

alter table public.message_reactions
  add constraint message_reactions_pkey primary key (message_id, user_id);
