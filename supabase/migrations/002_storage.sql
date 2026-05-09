-- Bucket para fotos de botines (público para lectura)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fotos-botines',
  'fotos-botines',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage
CREATE POLICY "allow_upload_fotos" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'fotos-botines');

CREATE POLICY "allow_read_fotos" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'fotos-botines');

CREATE POLICY "allow_update_fotos" ON storage.objects
  FOR UPDATE TO anon
  USING (bucket_id = 'fotos-botines');

CREATE POLICY "allow_delete_fotos" ON storage.objects
  FOR DELETE TO anon
  USING (bucket_id = 'fotos-botines');
