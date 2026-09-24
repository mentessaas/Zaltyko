-- Keep Storage buckets reproducible across environments.
-- Public media is intentionally limited to avatars and event assets; private
-- uploads remain the source for documents and assessment videos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 10485760,
    array['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]),
  ('events', 'events', true, 52428800,
    array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/octet-stream']::text[]),
  ('ticket-attachments', 'ticket-attachments', false, 10485760,
    array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
