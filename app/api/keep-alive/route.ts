import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// VercelのCron機能から定期的に呼び出され、Supabaseに軽いアクセスを送ることで
// 「7日間操作がないと自動的に一時停止する」仕様を回避する
export async function GET(request: NextRequest) {
  // Vercelが自動で付与するCRON_SECRETと照合し、外部から勝手に叩かれないようにする
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // RLS(ログイン必須)を回避できる特別な鍵で、DBに軽いアクセスをする
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from('grid_cells').select('grid_id').limit(1);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
