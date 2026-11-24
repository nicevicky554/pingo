-- PINGO — status replies keep a durable reference to the status they answer.
--
-- The reference survives status expiry (the FK is set to null only if the
-- status row is deleted), so the conversation keeps its context and can show
-- "This status is no longer available" instead of breaking.

alter table public.messages
  add column if not exists status_reply_to uuid
  references public.status_updates(id) on delete set null;

create index if not exists messages_status_reply_idx
  on public.messages (status_reply_to)
  where status_reply_to is not null;
