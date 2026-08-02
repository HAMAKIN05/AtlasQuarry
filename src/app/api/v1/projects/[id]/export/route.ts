import { NextResponse } from 'next/server';

import { exportProjectCsv, exportProjectMarkdown } from '@/domain/product/export';
import { authed } from '@/lib/api/handler';
import { ValidationError } from '@/lib/errors';

/**
 * プロジェクトの書き出し（F-19 Markdown / F-21 表計算）。
 *
 * **ファイル名は日本語のまま渡す。** `filename*=UTF-8''…` を使えば
 * 主要ブラウザはそのまま保存する。ローマ字に潰すと、あとから探せない。
 */
export const GET = authed<{ id: string }>(async ({ request, params }) => {
  const format = new URL(request.url).searchParams.get('format') ?? 'md';
  if (format !== 'md' && format !== 'csv') {
    throw new ValidationError('書き出せる形式は md か csv です');
  }

  const file =
    format === 'csv' ? await exportProjectCsv(params.id) : await exportProjectMarkdown(params.id);

  return new NextResponse(file.body, {
    headers: {
      'content-type': file.contentType,
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      // 書き出しは常にその時点の中身。キャッシュさせない
      'cache-control': 'no-store',
    },
  });
});
