import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EmptyState } from '@/components/app-ui';
import { listRecentActivity, type ActivityItem } from '@/domain/activity/queries';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';

export const metadata = { title: '監査ログ | AtlasQuarry' };

const ACTION_LABELS: Record<string, string> = {
  create: '作成',
  update: '更新',
  delete: '削除',
  status_change: 'ステータス変更',
  comment: 'コメント',
  triage: 'トリアージ',
  complete: '完了',
};

const ENTITY_LABELS: Record<string, string> = {
  task: 'タスク',
  product: 'プロジェクト',
  feature: 'まとまり',
  request: '要望',
  document: '文書',
  comment: 'コメント',
  actor: 'メンバー',
};

export default async function ActivitySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, 'activity.viewAll')) notFound();

  const params = await searchParams;
  const offset = Math.max(0, Number.parseInt(params.offset ?? '0', 10) || 0);
  const { items, total } = await listRecentActivity(50, offset);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">管理・監査</p>
        <h1 className="large-title">監査ログ</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          誰が、いつ、どの対象を変更したかを確認できます。削除・権限変更の確認にも使えます。
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState title="監査ログはまだありません" description="タスクやプロジェクトの変更履歴がここに表示されます。" />
      ) : (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>日時</th>
                <th>操作者</th>
                <th>操作</th>
                <th>対象</th>
                <th>変更内容</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => <ActivityRow key={item.id} item={item} />)}
            </tbody>
          </table>
        </div>
      )}

      <nav className="flex items-center justify-between gap-3" aria-label="監査ログのページ移動">
        {offset > 0 ? <Link className="chip" href={`/settings/activity?offset=${Math.max(0, offset - 50)}`}>← 新しい履歴</Link> : <span />}
        {offset + items.length < total && <Link className="chip" href={`/settings/activity?offset=${offset + 50}`}>古い履歴 →</Link>}
      </nav>
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const href = item.entityType === 'task' ? `/tasks/${item.entityId}` : item.entityType === 'request' ? `/requests/${item.entityId}` : null;
  const target = `${ENTITY_LABELS[item.entityType] ?? item.entityType}・${item.targetTitle ?? item.entityId.slice(0, 8)}`;
  const targetContent = href ? <Link href={href}>{target}</Link> : target;
  const diff = item.diffJson ? Object.entries(item.diffJson).map(([key, value]) => `${key}: ${String(value)}`).join(' / ') : '—';

  return (
    <tr>
      <td><time dateTime={item.createdAt.toISOString()}>{formatDateTime(item.createdAt)}</time></td>
      <td>{item.actorName}</td>
      <td>{ACTION_LABELS[item.action] ?? item.action}</td>
      <td>{targetContent}</td>
      <td className="max-w-md break-words text-muted-foreground">{diff}</td>
    </tr>
  );
}

function formatDateTime(value: Date): string {
  return value.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
