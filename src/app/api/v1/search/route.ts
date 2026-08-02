import { search } from '@/domain/search/service';
import { authed, ok } from '@/lib/api/handler';

/** 横断検索（F-12）。タスク・要望・資料をまとめて引く。 */
export const GET = authed(async ({ request }) => {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  return ok(await search(q));
});
