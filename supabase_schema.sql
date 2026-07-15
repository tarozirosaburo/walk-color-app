-- Supabaseの SQL Editor でこのまま実行してください

create table photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users default auth.uid(),
  file_path text not null,
  lat double precision not null,
  lng double precision not null,
  grid_id text not null,
  heading double precision,
  created_at timestamptz default now()
);

create table grid_cells (
  grid_id text primary key,
  user_id uuid references auth.users default auth.uid(),
  lat double precision not null,
  lng double precision not null,
  colored_at timestamptz default now()
);

-- 写真置き場のバケットも作成しておく(Storage画面から "photos" という名前で作成)
