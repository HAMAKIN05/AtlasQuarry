import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db/client';

export const dynamic = 'force-dynamic';

/** コンテナ監視・ロードバランサー向けの非認証ヘルスチェック。機密情報は返さない。 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      { status: 'ok', service: 'atlasquarry' },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { status: 'error', service: 'atlasquarry' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
