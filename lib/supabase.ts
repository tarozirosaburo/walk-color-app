import { createClient } from '@supabase/supabase-js';

// Supabaseプロジェクト作成後、.env.localに以下を設定してください
// NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
// NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 緯度経度を約100m四方のグリッドIDに変換する
// 0.001度 ≒ 111m(緯度方向)。まずはこの粗さで十分
export function toGridId(lat: number, lng: number): string {
  const gridSize = 0.001;
  const gridLat = Math.floor(lat / gridSize);
  const gridLng = Math.floor(lng / gridSize);
  return `${gridLat}_${gridLng}`;
}

// グリッドID(例: "37916_138934")から、その四角形の範囲(南西・北東の座標)を逆算する
export function gridIdToBounds(gridId: string) {
  const gridSize = 0.001;
  const [gridLat, gridLng] = gridId.split('_').map(Number);
  const south = gridLat * gridSize;
  const west = gridLng * gridSize;
  const north = south + gridSize;
  const east = west + gridSize;
  return { south, west, north, east };
}
