-- PINGO — allow an explicit "Only share with" status audience.
--
-- `status_audience` already stores per-viewer rules, but the visibility enum
-- had no value that means "only these people". Add it in its own migration
-- because PostgreSQL cannot use a new enum value in the transaction that
-- creates it. Migration 0016 updates can_view_status() to honour it.

alter type public.visibility add value if not exists 'only';

-- Owners may remove the media of their own expired/deleted statuses.
drop policy if exists status_media_delete on storage.objects;
create policy status_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'status-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
