-- これまで開発のために開放していた権限を締め直し、
-- 「ログインしたユーザーだけが読み書きできる」状態に変更する

-- Storage: 匿名アップロード用のポリシーを削除
drop policy if exists "Allow anon uploads to photos" on storage.objects;
drop policy if exists "Allow anon read from photos" on storage.objects;

-- Storage: ログイン済みユーザーのみ、photosバケットに対して読み書き・削除ができる
create policy "Authenticated users can manage photos bucket"
on storage.objects for all
to authenticated
using (bucket_id = 'photos')
with check (bucket_id = 'photos');

-- テーブル: RLSを再度有効化
alter table photos enable row level security;
alter table grid_cells enable row level security;

-- テーブル: ログイン済みユーザーのみ読み書きできる
create policy "Authenticated users can manage photos" on photos
for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage grid_cells" on grid_cells
for all to authenticated using (true) with check (true);
