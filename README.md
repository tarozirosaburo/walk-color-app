# 散歩の地図 (walk-color-app)

歩いて写真を撮ると、地図上のマスが少しずつ色づいていく個人用アプリの雛形です。

## セットアップ手順

1. **Supabaseプロジェクトを作成**
   - https://supabase.com で新規プロジェクトを作成
   - SQL Editorで `supabase_schema.sql` の内容を実行
   - Storage で `photos` という名前のバケットを作成(Public推奨)

2. **環境変数を設定**
   プロジェクト直下に `.env.local` を作成し、SupabaseのURLとanon keyを設定:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
   ```

3. **依存関係をインストールして起動**
   ```
   npm install
   npm run dev
   ```
   http://localhost:3000 で確認できます。

## ディレクトリ構成

```
app/
  layout.tsx    共通レイアウト
  page.tsx      トップページ(地図+撮影ボタン)
  globals.css   全体スタイル
components/
  WalkMap.tsx   地図表示コンポーネント(MapLibre)
lib/
  supabase.ts   Supabaseクライアント + 座標→グリッドID変換
supabase_schema.sql   DBのテーブル定義
```

## 現状できていること / 次にやること

- [x] 地図の表示
- [x] 写真アップロード→位置情報取得→DB保存の一連の流れ
- [ ] 塗られたマスをポリゴンとして地図に色付け表示(現状は仮のマーカー表示)
- [ ] ログイン機能(Supabase Auth)
- [ ] PWA化してホーム画面に追加できるようにする
- [ ] 写真一覧・詳細画面
# walk-color-app
