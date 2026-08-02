import Link from 'next/link';

import { PageHeader } from '@/components/app-ui';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';

import { LogoutButton } from './LogoutButton';

export const metadata = { title: '設定 | AtlasQuarry' };

/**
 * 設定の入口。
 *
 * 各項目が**何を変えるところなのか**を1行で書く。名前だけ並べても、
 * どこを開けばよいか分からない。
 */
export default async function SettingsPage() {
  const actor = await requireActor();
  const isManager = can(actor, 'member.invite');

  const items = [
    {
      href: '/settings/profile',
      title: '自分の設定',
      desc: '名前、パスワード、2要素認証を変えます',
      show: true,
    },
    {
      href: '/settings/members',
      title: 'メンバー',
      desc: '招待、名前と権限の変更、利用停止',
      show: isManager,
    },
    {
      href: '/settings/projects',
      title: 'プロジェクト',
      desc: '名前や状態の変更、削除',
      show: can(actor, 'product.update'),
    },
    {
      href: '/settings/integrations',
      title: '外部連携',
      desc: 'Discord への通知、メールの送信設定',
      show: can(actor, 'integration.manage'),
    },
    {
      href: '/settings/api-keys',
      title: 'AIエージェントの鍵',
      desc: 'Claude Code などから読み書きするための鍵（MCP）',
      show: can(actor, 'integration.manage'),
    },
    {
      href: '/settings/notifications',
      title: 'お知らせの受け取り',
      desc: 'どの出来事を、どこで受け取るか',
      show: true,
    },
    {
      href: '/settings/labels',
      title: '呼び名',
      desc: '「作業中」「確認待ち」などの言い方を会社に合わせます',
      show: isManager,
    },
  ].filter((item) => item.show);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="設定" />

      <ul className="card-list sm:grid sm:grid-cols-2 sm:gap-2.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="card flex h-full flex-col gap-1.5">
              <span className="card-title">{item.title}</span>
              <span className="text-sm text-muted-foreground">{item.desc}</span>
            </Link>
          </li>
        ))}
      </ul>

      <LogoutButton />
    </div>
  );
}
