import Link from 'next/link';
import { Suspense } from 'react';

import { Badge, EmptyState, Loading } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
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
    <div className="search-workspace">
      <header className="workspace-home-header search-workspace-header">
        <div>
          <p className="eyebrow">見つける</p>
          <h1 className="large-title">探す</h1>
          <p className="mt-2 text-sm text-muted-foreground">タスク・要望・資料を横断して、必要な情報へすぐ移動できます。</p>
        </div>
      </header>

      {/* 素の form。JS が無くても引ける */}
      <form action="/search" className="search-form" role="search">
        <label htmlFor="search-query" className="sr-only">探す言葉</label>
        <Input
          id="search-query"
          name="q"
          defaultValue={query}
          placeholder="タスク・要望・資料をまとめて探す"
          autoFocus
        />
        <Button type="submit">検索</Button>
      </form>

      {query.length === 0 ? (
        <p className="search-help">
          {MIN_QUERY_LENGTH}文字以上で探せます。タスク・要望・資料の題名と本文が対象です。
        </p>
      ) : query.length < MIN_QUERY_LENGTH ? (
        <p className="search-help" role="status">
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
    <div className="search-results">
      <div className="search-results-heading">
        <h2>検索結果</h2>
        <p>{hits.length} 件</p>
      </div>
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
