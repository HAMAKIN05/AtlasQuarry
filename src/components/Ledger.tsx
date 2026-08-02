import Link from 'next/link';
import type { ReactNode } from 'react';

/** プロジェクトごとの点の色。6色で打ち止め、以降は循環させる。 */
export function dotColor(key: string | null | undefined): string {
  if (!key) return 'var(--border-strong)';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return `var(--dot-${(hash % 6) + 1})`;
}

/** プロジェクトを示す点。名前だけだと、どの案件の話か毎回読まないと分からない。 */
export function Dot({ seed }: { seed: string | null | undefined }) {
  return <span className="dot" style={{ ['--dot' as string]: dotColor(seed) }} aria-hidden="true" />;
}

/**
 * 一覧の部品。
 *
 * **1件ずつ独立したカードにはしない。** カードが増えるほど影と角が散らかって、
 * 画面が騒がしくなる。まとまりを白い角丸カード1枚にして、中を細い線で仕切る。
 *
 * 状態（次にやる／進行中／待ち／完了）は、**カードのまとまりと、その上の見出し**で示す。
 * 行ごとに色付きのバッジを読ませない。
 *
 * いま手を付ける1件だけは `Hero` として大きく置く。面積そのものが優先順位を伝えるので、
 * 「◯件あります」という説明が要らない。
 */

/** 段。見出しはカードの外に置く。 */
export function Band({
  label,
  count,
  action,
  children,
}: {
  label: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="band" aria-label={label}>
      <h2 className="band-heading">
        {label}
        {count !== undefined && count > 0 && <span className="count">{count}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </h2>
      {children}
    </section>
  );
}

/**
 * 行を積む場所。
 *
 * **1枚のカードにまとめるのをやめた。** 薄い線で仕切ると「表」に見えて、
 * 1件ずつが独立している感じが出ない、という指摘への対応。
 * いまは1件＝1カードで、間隔を空けて積む。
 */
export function Stack({ children }: { children: ReactNode }) {
  return <ul className="card-list">{children}</ul>;
}

/**
 * 1行。
 *
 * 左端＝その場で終わらせる操作、中央＝開く、右端＝状態の変更。
 * **並びを固定する。** どこを押すと何が起きるかが毎回同じであることが、
 * 説明文よりも早く使い方を伝える。
 */
export function Row({
  lead,
  href,
  title,
  meta,
  trailing,
}: {
  lead?: ReactNode;
  href: string;
  title: string;
  meta?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <li className="card flex items-center gap-3">
      {lead && <span className="shrink-0">{lead}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link href={href} className="card-title">
          {title}
        </Link>
        {meta && <span className="stack-meta">{meta}</span>}
      </span>
      {/*
        **右端は1つだけ。** その場で操作するもの（状態の変更）があればそれを出し、
        無ければ「次の画面へ行く」印として chevron を出す。両方は出さない。
      */}
      {trailing ? <span className="shrink-0">{trailing}</span> : <span className="chevron" aria-hidden="true" />}
    </li>
  );
}

/** いま手を付ける1件。画面で一番大きい面。 */
export function Hero({
  href,
  overline,
  title,
  meta,
  action,
}: {
  href: string;
  overline?: string;
  title: string;
  meta?: ReactNode;
  action?: string;
}) {
  return (
    <Link href={href} className="hero">
      {overline && (
        <span className="mb-1.5 block text-[0.8rem] font-semibold text-muted-foreground">
          {overline}
        </span>
      )}
      <span className="hero-title block">{title}</span>
      {meta && <span className="stack-meta mt-2.5">{meta}</span>}
      {action && (
        <span className="mt-4 flex min-h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
          {action}
        </span>
      )}
    </Link>
  );
}
