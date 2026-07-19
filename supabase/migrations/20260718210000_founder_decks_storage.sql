-- Adds a private storage bucket for founder-uploaded pitch decks. This is
-- purely additive: it creates a new bucket and storage policies only, and
-- does not alter any table, column, or policy from product_platform_core.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('founder-decks', 'founder-decks', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy founder_decks_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'founder-decks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy founder_decks_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'founder-decks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy founder_decks_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'founder-decks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'founder-decks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy founder_decks_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'founder-decks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
