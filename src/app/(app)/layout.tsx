import { redirect } from 'next/navigation';

import { LabelsProvider } from '@/components/LabelsProvider';
import { countRequestsByStatus } from '@/domain/request/service';
import { loadLabels } from '@/domain/setting/labels';
import { currentActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';

import { AppNav } from './AppNav';

/**
 * 認証必須の画面すべての外枠。
 *
 * 未認証なら /login へリダイレクトする。ここで一括して弾くことで、各ページが
 * 認証チェックを書き忘れる余地をなくす（ページ側でも requireActor で二重に弾く）。
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect('/login');

  const [labels, counts] = await Promise.all([loadLabels(), countRequestsByStatus()]);

  // 判断待ちの要望はナビに数字で出す。放置されていることが一目で分かるように
  const pendingRequests = can(actor, 'request.triage')
    ? (counts.received ?? 0) + (counts.reviewing ?? 0)
    : 0;

  return (
    <LabelsProvider value={labels}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <AppNav
          actor={{ id: actor.id, name: actor.name, role: actor.role }}
          pendingRequests={pendingRequests}
        />
        {/* スマホは下部タブのぶん余白を空ける。lg 以上ではタブが無い */}
        <main className="px-4 pt-4 pb-24 lg:px-6 lg:py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </LabelsProvider>
  );
}
