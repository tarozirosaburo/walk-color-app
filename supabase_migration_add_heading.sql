-- 既存のphotosテーブルに、撮影時の方位(0〜360度、北=0)を保存するカラムを追加
alter table photos add column if not exists heading double precision;
