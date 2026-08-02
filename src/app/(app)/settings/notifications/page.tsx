import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { notificationPref } from '@/db/schema';
import { BackLink, PageHeader } from '@/components/app-ui';
import { NOTIFY_EVENTS, type NotifyEvent } from '@/infra/notifier/types';
import { requireActor } from '@/lib/auth/cookies';

import { PrefForm } from './PrefForm';

export const metadata = { title: 'お知らせの受け取り | AtlasQuarry' };

/** 既定値。ドメイン側の DEFAULT_CHANNELS と同じにする */
const DEFAULTS: Record<NotifyEvent, Array<'web' | 'mail' | 'discord'>> = {
  'task.assigned': ['web', 'discord'],
  'task.due_soon': ['web'],
  'task.overdue': ['web', 'discord'],
  'task.completed': ['web'],
  'comment.created': ['web'],
  'comment.mentioned': ['web', 'discord'],
  'request.created': ['web', 'discord'],
  'request.decided': ['web'],
};

export default async function NotificationSettingsPage() {
  const actor = await requireActor();

  const rows = await db
    .select({
      eventType: notificationPref.eventType,
      channel: notificationPref.channel,
      enabled: notificationPref.enabled,
    })
    .from(notificationPref)
    .where(eq(notificationPref.actorId, actor.id));

  const initial: Record<string, Array<'web' | 'mail' | 'discord'>> = {};
  for (const event of NOTIFY_EVENTS) {
    const own = rows.filter((r) => r.eventType === event);
    initial[event] = own.length === 0 ? DEFAULTS[event] : own.filter((r) => r.enabled).map((r) => r.channel);
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/settings" label="設定" />
      <PageHeader
        title="お知らせの受け取り"
        description="出来事ごとに、どこで受け取るかを選べます。メールと Discord は、経営者が外部連携を設定していないと届きません。"
      />
      <PrefForm initial={initial} />
    </div>
  );
}
