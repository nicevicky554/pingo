-- ===========================================================================
-- PINGO — DISABLE ROW LEVEL SECURITY (OWNER REQUEST)
-- ===========================================================================
-- WARNING: This removes database-enforced access control. Anyone holding the
-- public anon key can read and write every exposed table and storage object
-- through the Supabase API. Authorization now depends entirely on application
-- code. Run this only because the owner explicitly accepted that risk.
--
-- This migration is idempotent. It does not drop tables, columns or data.
-- ===========================================================================

-- 1. Drop every policy in the public schema.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    begin
      execute format(
        'drop policy if exists %I on %I.%I',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename
      );
    exception when insufficient_privilege then
      raise notice 'Could not drop policy %.% on %.%',
        policy_row.schemaname, policy_row.tablename, policy_row.policyname;
    end;
  end loop;
end
$$;

-- 2. Disable RLS on every table and partitioned table in public.
do $$
declare
  table_row record;
begin
  for table_row in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
    union
    select schemaname, tablename
    from pg_partitioned_tables
    where schemaname = 'public'
  loop
    begin
      execute format(
        'alter table %I.%I disable row level security',
        table_row.schemaname,
        table_row.tablename
      );
    exception when insufficient_privilege then
      raise notice 'Could not disable RLS on %.%',
        table_row.schemaname, table_row.tablename;
    end;
  end loop;
end
$$;

-- 3. Storage: drop object policies and disable RLS on storage.objects.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    begin
      execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
    exception when insufficient_privilege then
      raise notice 'Could not drop storage policy %', policy_row.policyname;
    end;
  end loop;

  begin
    alter table storage.objects disable row level security;
  exception when insufficient_privilege then
    raise notice 'Could not disable RLS on storage.objects; run as the project owner.';
  end;
end
$$;

-- 4. Realtime authorization table: remove channel policies and RLS so private
--    topics are no longer restricted by the database.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
  loop
    begin
      execute format('drop policy if exists %I on realtime.messages', policy_row.policyname);
    exception when insufficient_privilege then
      raise notice 'Could not drop realtime policy %', policy_row.policyname;
    end;
  end loop;

  begin
    alter table realtime.messages disable row level security;
  exception
    when insufficient_privilege then
      raise notice 'Could not disable RLS on realtime.messages; run as the project owner.';
    when undefined_table then
      raise notice 'realtime.messages is not present in this project yet.';
  end;
end
$$;

-- 5. Keep API grants in place; RLS was the only row filter.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- 6. Verify at any time with:
--    select schemaname, tablename, rowsecurity from pg_tables
--    where schemaname in ('public','storage','realtime') order by 1,2;
