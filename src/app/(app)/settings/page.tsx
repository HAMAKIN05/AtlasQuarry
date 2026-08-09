import {
  BellRingIcon,
  BotIcon,
  CableIcon,
  FolderKanbanIcon,
  KeyRoundIcon,
  LanguagesIcon,
  UserCircleIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';

import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';

import { LogoutButton } from './LogoutButton';

export const metadata = { title: '設定 | AtlasQuarry' };

export default async function SettingsPage() {
  const actor = await requireActor();
  const isManager = can(actor, 'member.invite');

  const items = [
    {
      href: '/settings/profile',
      title: '自分の設定',
      description: '名前、パスワード、2要素認証',
      Icon: UserCircleIcon,
      show: true,
    },
    {
      href: '/settings/members',
      title: 'メンバー',
      description: '招待、名前、権限、利用停止',
      Icon: UsersIcon,
      show: isManager,
    },
    {
      href: '/settings/projects',
      title: 'プロジェクト',
      description: '名前や状態の変更、削除',
      Icon: FolderKanbanIcon,
      show: can(actor, 'product.update'),
    },
    {
      href: '/settings/integrations',
      title: '外部連携',
      description: 'Discord通知、メール送信の設定',
      Icon: CableIcon,
      show: can(actor, 'integration.manage'),
    },
    {
      href: '/settings/api-keys',
      title: 'AIエージェントの鍵',
      description: 'Claude Codeなどから読み書きするための鍵',
      Icon: KeyRoundIcon,
      show: can(actor, 'integration.manage'),
    },
    {
      href: '/settings/notifications',
      title: 'お知らせの受け取り',
      description: 'どの出来事を、どこで受け取るか',
      Icon: BellRingIcon,
      show: true,
    },
    {
      href: '/settings/labels',
      title: '呼び名',
      description: 'ステータスや優先度の表示名を会社に合わせる',
      Icon: LanguagesIcon,
      show: isManager,
    },
  ].filter((item) => item.show);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">ワークスペース</p>
        <h1 className="large-title">設定</h1>
        <p className="mt-2 text-sm text-muted-foreground">自分とチームの使い方を整えます。</p>
      </header>

      <section className="grid gap-3 md:grid-cols-2" aria-label="設定項目">
        {items.map(({ href, title, description, Icon }) => (
          <Link key={href} href={href} className="card group flex min-h-[7.5rem] items-start gap-4 p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold">{title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{description}</span>
            </span>
            <span className="chevron mt-2 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        ))}
      </section>

      <section className="surface flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold">ログアウト</h2>
          <p className="mt-1 text-sm text-muted-foreground">次に開いたときは、もう一度ログインが必要です。</p>
        </div>
        <LogoutButton />
      </section>
    </div>
  );
}
