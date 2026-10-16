-- Article photos (product images from the supplier) in the 'article-images' bucket, stored as
-- "<content hash>.jpg" so articles that share a photo share one file. The bucket is public to read:
-- these are product photos without personal data, shown as small thumbnails in long lists, where
-- signing every URL would only slow the page down. Only team members can add or remove files.
-- articles.image_url holds the public URL. Backward compatible: nothing in production uses it yet.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('article-images', 'article-images', true, 1048576, array['image/jpeg']);

create policy "article-images insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'article-images' and (select public.is_team_member()));
create policy "article-images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'article-images' and (select public.is_team_member()));
