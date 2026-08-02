import { ChevronLeftIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * 画面をまたいで使うアプリ固有の部品。
 *
 * shadcn/ui の素の部品（Button / Card / Badge …）は components/ui に置き、
 * 「AtlasQuarry としてどう見せるか」を決めたものだけをここに置く。
 */

/**
 * 空状態。**「ありません」で終わらせない**（CLAUDE.md UI規約）。
 *
 * 何のための場所かを1行で説明し、次の操作へのボタンを置く。初めて開いた人が
 * 説明書なしで最初の1件を作れることが目的。
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  children,
  className,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'empty-inline flex flex-col items-start gap-2',
        className,
      )}
    >
      <p className="font-bold">{title}</p>
      <p className="max-w-[52ch] text-sm text-muted-foreground">{description}</p>
      {actionHref && actionLabel && (
        <Button asChild className="mt-1">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
      {children}
    </div>
  );
}

/** 進捗バー。数値も併記する（バーだけだと正確な割合が読めない）。 */
export function Progress({
  done,
  total,
  className,
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/*
        **細い灰色の線をやめた。** 1.5px の灰色は「置いただけ」に見えて安っぽい。
        太さを持たせ、進んだぶんに色を入れる。数字は右に小さく添えるのではなく、
        パーセントだけを大きめに出して、内訳は補助にする。
      */}
      <div
        className="h-2.5 flex-1 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="進捗"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="tabular shrink-0 text-sm font-bold">
        {total === 0 ? (
          <span className="text-sm font-semibold text-subtle">タスクなし</span>
        ) : (
          <>
            {percent}
            <span className="text-xs font-semibold text-muted-foreground">
              % · {done}/{total}
            </span>
          </>
        )}
      </span>
    </div>
  );
}

/** 画面の見出し。説明文と主操作をまとめて置く。 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {description && (
          <p className="max-w-[62ch] text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="[&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </header>
  );
}

/**
 * 戻る導線。
 *
 * **矢印つきの1本のリンクにする。** パンくずを並べると、どれが「戻る」なのか
 * 初見で分からない（実際に「上のボタンを押さないと戻れないが気づけない」と言われた）。
 * 戻り先を言葉で書いて、押す前に行き先が分かるようにする。
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <nav aria-label="現在の場所">
      <Link
        href={href}
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" aria-hidden="true" />
        {label}
      </Link>
    </nav>
  );
}

export function Loading({ label = '読み込んでいます' }: { label?: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="surface p-4 text-sm text-muted-foreground"
    >
      {label}
    </p>
  );
}

export function Alert({
  children,
  tone = 'warn',
  className,
}: {
  children: ReactNode;
  tone?: 'warn' | 'error';
  className?: string;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-md px-3 py-2 text-sm',
        tone === 'error' ? 'bg-destructive-soft text-destructive' : 'bg-warning-soft text-warning',
        className,
      )}
    >
      {children}
    </p>
  );
}

/** フォームの1項目。ラベル・入力・補足の並びを揃える。 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ---- 状態と色の対応。増やすときは意味との結び付きを崩さない ---- */

export function taskStatusTone(status: string) {
  switch (status) {
    case 'in_progress':
      return 'progress' as const;
    case 'review':
      return 'warn' as const;
    case 'done':
      return 'done' as const;
    case 'cancelled':
      return 'muted' as const;
    default:
      return 'neutral' as const;
  }
}

export function requestStatusTone(status: string) {
  switch (status) {
    case 'received':
      return 'warn' as const;
    case 'reviewing':
      return 'progress' as const;
    case 'accepted':
      return 'done' as const;
    case 'rejected':
      return 'muted' as const;
    default:
      return 'neutral' as const;
  }
}

export function priorityTone(priority: string) {
  switch (priority) {
    case 'urgent':
      return 'danger' as const;
    case 'high':
      return 'warn' as const;
    case 'low':
      return 'muted' as const;
    default:
      return 'neutral' as const;
  }
}

export { Badge };
