import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * 切羽帳（きりはちょう）の部品。
 *
 * **カードを並べるのをやめ、1冊の帳面として上から下へ積む。**
 * 状態はバッジの色ではなく、**どの段に載っているか**で示す。
 * 同じプロジェクトが続く間は、左端の 3px の線（地層線）でつなぐ。
 * これは装飾ではなく、「どこまでが同じ案件か」という情報。
 */

/*
 * **`'use client'` は付けない。**
 * `seamColor()` はホーム（サーバーコンポーネント）からも呼ぶ。クライアント専用の
 * モジュールに置くと「サーバーからクライアントの関数は呼べない」で落ちる（実際に落とした）。
 * ここは Link と props しか使っていないので、両方から使える素のモジュールでよい。
 */

/** プロジェクトごとに地層線の色を割り当てる。6色で打ち止め、以降は循環させる。 */
export function seamColor(key: string | null | undefined): string {
  if (!key) return 'var(--border-strong)';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return `var(--seam-${(hash % 6) + 1})`;
}

/** 段。「── 次に掘る ── 3 ──────」 */
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
        {action}
      </h2>
      {children}
    </section>
  );
}

/**
 * 帳面の1行。
 *
 * 左端＝その場で終わらせる操作、中央＝開く、右端＝期限と相手。
 * **並びを固定する。** 行のどこを押すと何が起きるかが毎回同じであることが、
 * 説明文より早く使い方を伝える。
 */
export function SeamRow({
  seam,
  seamStart,
  seamEnd,
  lead,
  href,
  title,
  meta,
  trailing,
}: {
  seam: string;
  seamStart?: boolean;
  seamEnd?: boolean;
  /** 左端に置く操作（完了の丸など） */
  lead?: ReactNode;
  href: string;
  title: string;
  meta?: ReactNode;
  /** 右端に置く操作 */
  trailing?: ReactNode;
}) {
  return (
    <li
      className="seam-row"
      style={{ ['--seam' as string]: seam }}
      data-seam-start={seamStart ? 'true' : undefined}
      data-seam-end={seamEnd ? 'true' : undefined}
    >
      {lead && <span className="shrink-0 pt-0.5">{lead}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link href={href} className="seam-title hover:underline">
          {title}
        </Link>
        {meta && <span className="seam-meta">{meta}</span>}
      </span>
      {trailing && <span className="shrink-0 pt-0.5">{trailing}</span>}
    </li>
  );
}

/**
 * いま掘っている面。**画面で唯一、囲ってよいもの。**
 * 「次はこれ」を1件だけ大きく置く。面積そのものが優先順位を伝える。
 */
export function Face({
  seam,
  href,
  overline,
  title,
  meta,
}: {
  seam: string;
  href: string;
  overline?: string;
  title: string;
  meta?: ReactNode;
}) {
  return (
    <Link href={href} className="face" style={{ ['--seam' as string]: seam }}>
      {overline && (
        <span className="mb-1 block text-[0.78rem] font-semibold text-muted-foreground">
          {overline}
        </span>
      )}
      <span className="face-title block">{title}</span>
      {meta && <span className="seam-meta mt-2">{meta}</span>}
    </Link>
  );
}
