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
      {/*
        **スマホではページ自体をスクロールさせない。**

        下部タブを `position: fixed` で置いていたが、iOS Safari では
        「高速でスクロールすると一瞬切れる」と指摘された。原因は2つあって、
        どちらも fixed である限り消えない。

          - 慣性スクロール中、Safari は固定要素の再描画を遅らせる
          - スクロールでツールバーが開閉すると表示領域の高さが変わり、
            固定要素が追従するまでの間ずれる

        そこで、外枠を画面の高さ（`h-dvh`）に固定し、**本文だけを内側で
        スクロールさせる。** ページ本体が動かないのでツールバーも開閉せず、
        タブは構造上ずれようがない。

        DOM の順番は AppNav（上バー・サイドバー・下タブ）→ main なので、
        縦並びの見た目は `order` で作る。lg 以上は従来どおりページ全体で
        スクロールする（サイドバーは sticky）。
      */}
      <div className="flex h-dvh flex-col overflow-hidden lg:grid lg:h-auto lg:min-h-dvh lg:grid-cols-[15rem_minmax(0,1fr)] lg:overflow-visible">
        <AppNav
          actor={{ id: actor.id, name: actor.name, role: actor.role }}
          pendingRequests={pendingRequests}
        />
        <main className="order-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-10 lg:order-none lg:overflow-visible lg:px-6 lg:py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </LabelsProvider>
  );
}
