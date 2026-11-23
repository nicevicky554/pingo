-- PINGO — copy of supabase/migrations/0005_disable_rls.sql
-- Run this in the Supabase SQL editor as the project owner.
--
-- WARNING: removes all database-enforced access control. The anon key can then
-- read and write every exposed table and storage object. Owner accepted risk.

do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public'
  loop
    begin
      execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select schemaname, tablename from pg_tables where schemaname = 'public'
           union
           select schemaname, tablename from pg_partitioned_tables where schemaname = 'public'
  loop
    begin
      execute format('alter table %I.%I disable row level security', r.schemaname, r.tablename);
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
  loop
    begin
      execute format('drop policy if exists %I on storage.objects', r.policyname);
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin alter table storage.objects disable row level security;
  exception when insufficient_privilege then null;
  end;
end $$;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'realtime' and tablename = 'messages'
  loop
    begin
      execute format('drop policy if exists %I on realtime.messages', r.policyname);
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin alter table realtime.messages disable row level security;
  exception when insufficient_privilege then null;
  when undefined_table then null;
  end;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname in ('public','storage','realtime')
order by 1, 2;
