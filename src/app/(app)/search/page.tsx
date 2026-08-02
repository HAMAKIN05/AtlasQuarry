import Link from 'next/link';
import { Suspense } from 'react';

import { Badge, EmptyState, Loading } from '@/components/app-ui';
import { Input } from '@/components/ui/input';
import { MIN_QUERY_LENGTH, search } from '@/domain/search/service';
import { requireActor } from '@/lib/auth/cookies';
import { formatRelative } from '@/lib/format';

type Props = { searchParams: Promise<{ q?: string }> };

export const metadata = { title: '探す | AtlasQuarry' };

const KIND_LABELS = { task: 'タスク', request: '要望', document: '資料' } as const;

/**
 * 探す（F-12）。
 *
 * **種類を先に選ばせない。** 「どこにあるか分からないから探す」のに、
 * 探す前にタスクか資料かを決めさせるのは筋が悪い。まとめて出して、
 * 結果に種類の札を付ける。
 */
export default async function SearchPage({ searchParams }: Props) {
  await requireActor();
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="large-title">探す</h1>

      {/* 素の form。JS が無くても引ける */}
      <form action="/search" className="flex gap-2">
        <Input
          name="q"
          defaultValue={query}
          placeholder="タスク・要望・資料をまとめて探す"
          autoFocus
          aria-label="探す言葉"
        />
      </form>

      {query.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          {MIN_QUERY_LENGTH}文字以上で探せます。タスク・要望・資料の題名と本文が対象です。
        </p>
      ) : query.length < MIN_QUERY_LENGTH ? (
        <p className="px-1 text-sm text-muted-foreground">
          {MIN_QUERY_LENGTH}文字以上を入れてください。
        </p>
      ) : (
        <Suspense key={query} fallback={<Loading label="探しています" />}>
          <Results query={query} />
        </Suspense>
      )}
    </div>
  );
}

async function Results({ query }: { query: string }) {
  const hits = await search(query);

  if (hits.length === 0) {
    return (
      <EmptyState
        title="見つかりませんでした"
        description="言葉を短くするか、別の言い方で試してみてください。"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[13px] text-muted-foreground">{hits.length} 件</p>
      <div className="card-list">
        {hits.map((hit) => (
          <Link key={`${hit.kind}-${hit.id}`} href={hit.url} className="card">
            <span className="flex items-start gap-2">
              <span className="card-title min-w-0 flex-1">{hit.title}</span>
              <Badge tone="neutral">{KIND_LABELS[hit.kind]}</Badge>
            </span>
            {hit.snippet && (
              <span className="mt-1 block text-[15px] text-muted-foreground">{hit.snippet}</span>
            )}
            <span className="stack-meta mt-1.5">
              {hit.projectName && <span>{hit.projectName}</span>}
              <span>{formatRelative(hit.updatedAt)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
