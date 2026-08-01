import Link from 'next/link';

import { PageHeader } from '@/components/app-ui';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';

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
      desc: '名前と権限の変更、利用停止',
      show: isManager,
    },
    {
      href: '/settings/projects',
      title: 'プロジェクト',
      desc: '名前や状態の変更、削除',
      show: can(actor, 'product.update'),
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

      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex flex-col gap-2 surface p-4 hover:border-primary">
              <span className="flex-1 text-base font-bold">{item.title}</span>
              <span className="text-sm text-muted-foreground">{item.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
