import Link from 'next/link';

/**
 * 画面をまたいで使う小さな部品。
 *
 * ここに集めておくと、「空のときの見せ方」「状態の出し方」が画面ごとにばらけない。
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
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      <p className="empty-desc">{description}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn-primary">
          {actionLabel}
        </Link>
      )}
      {children}
    </div>
  );
}

/** ステータスや優先度の小さな札。色は tone で決める。 */
export function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'progress' | 'done' | 'warn' | 'danger' | 'muted';
}) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

/** タスクのステータス → 札の色。数が少ないので表で持つ。 */
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

/** 進捗バー。数値も併記する（バーだけだと正確な割合が読めない）。 */
export function Progress({ done, total }: { done: number; total: number }) {
  const ratio = total === 0 ? 0 : done / total;
  const percent = Math.round(ratio * 100);

  return (
    <div className="progress-wrap">
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="進捗"
      >
        <div className="progress-fill" style={{ inlineSize: `${percent}%` }} />
      </div>
      <span className="progress-text">
        {total === 0 ? 'タスクなし' : `${percent}%（${done}/${total}）`}
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
  action?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {action && <div className="page-head-action">{action}</div>}
    </header>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Loading({ label = '読み込んでいます' }: { label?: string }) {
  return (
    <p className="loading" role="status" aria-live="polite">
      {label}
    </p>
  );
}
