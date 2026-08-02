import Link from 'next/link';
import type { ReactNode } from 'react';

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

/** 行をまとめる白いカード。 */
export function Stack({ children }: { children: ReactNode }) {
  return <ul className="stack">{children}</ul>;
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
    <li className="stack-row">
      {lead && <span className="shrink-0">{lead}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link href={href} className="stack-title hover:underline">
          {title}
        </Link>
        {meta && <span className="stack-meta">{meta}</span>}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
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
