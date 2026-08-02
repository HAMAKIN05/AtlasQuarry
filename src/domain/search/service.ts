import { sql } from 'drizzle-orm';

import { db } from '@/db/client';

/**
 * 全文検索（F-12）。
 *
 * **`pg_bigm` を使う。** 日本語は単語で切れないので、`tsvector` の形態素解析では
 * 「日報」で「日報自動化」を引けないことがある。2-gram なら**部分一致がそのまま効く。**
 * 索引（`gin_bigm_ops`）は初回マイグレーションで作ってある。
 *
 * **タスク・要望・資料を横断して1つの結果にする。** 「どこにあるか分からないから探す」
 * のに、探す前に種類を選ばせるのは筋が悪い。
 *
 * **2文字未満は検索しない。** bigm は2-gram なので1文字だと索引が効かず、
 * 全件走査になる。件数が少ないうちは動くが、増えたときに急に遅くなる。
 */

export const MIN_QUERY_LENGTH = 2;

export type SearchHit = {
  kind: 'task' | 'request' | 'document';
  id: string;
  title: string;
  snippet: string | null;
  url: string;
  projectName: string | null;
  updatedAt: Date;
};

/** 前後を少しだけ添えた抜粋。**見つかった理由が分かる長さ**にする。 */
function snippetOf(body: string | null, query: string): string | null {
  if (!body) return null;
  const at = body.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return body.slice(0, 80);
  const from = Math.max(0, at - 30);
  return `${from > 0 ? '…' : ''}${body.slice(from, from + 100)}…`;
}

export async function search(query: string, limit = 30): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];

  const like = `%${q}%`;

  /*
   * 3つのテーブルを1本の SQL で引く。**アプリ側で3回引いて混ぜない**――
   * 並び順（更新の新しい順）が種類ごとに分かれてしまう。
   */
  const rows = await db.execute(sql`
    select 'task' as kind, t.id::text as id, t.key as ref, t.title, t.body_md as body,
           p.name as project_name, t.updated_at as updated_at
      from task t
      join product p on p.id = t.product_id
     where t.title like ${like} or coalesce(t.body_md, '') like ${like}

    union all

    select 'request' as kind, r.id::text, null as ref, r.title, r.body_md,
           p.name, r.created_at
      from request r
      left join product p on p.id = r.product_id
     where r.title like ${like} or coalesce(r.body_md, '') like ${like}

    union all

    select 'document' as kind, d.id::text, null as ref, d.title, d.body_md,
           p.name, d.updated_at
      from document d
      left join product p on p.id = d.product_id
     where d.title like ${like} or d.body_md like ${like}

     order by updated_at desc
     limit ${limit}
  `);

  const list = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];

  return list.map((row) => {
    const kind = row.kind as SearchHit['kind'];
    const id = row.id as string;
    const ref = row.ref as string | null;

    return {
      kind,
      id,
      title: row.title as string,
      snippet: snippetOf(row.body as string | null, q),
      url:
        kind === 'task' ? `/tasks/${ref}` : kind === 'request' ? `/requests/${id}` : `/docs/${id}`,
      projectName: (row.project_name as string | null) ?? null,
      updatedAt: new Date(row.updated_at as string),
    };
  });
}
