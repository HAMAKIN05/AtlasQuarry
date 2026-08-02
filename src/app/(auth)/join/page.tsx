import { redirect } from 'next/navigation';

import { checkInvitation } from '@/domain/invitation/service';
import { currentActor } from '@/lib/auth/cookies';
import { ROLE_LABELS } from '@/lib/labels';

import { JoinForm } from './JoinForm';

type Props = { searchParams: Promise<{ token?: string }> };

export const metadata = { title: '招待 | AtlasQuarry' };

/** 招待リンクの受け取り口（F-10）。`/join?token=…` */
export default async function JoinPage({ searchParams }: Props) {
  if (await currentActor()) redirect('/');

  const { token } = await searchParams;
  const result = token ? await checkInvitation(token) : { valid: false as const };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">AtlasQuarry</h1>
        <p className="mt-1 text-sm text-muted-foreground">社内システム内製化のタスク管理</p>
      </div>

      {result.valid && token ? (
        <JoinForm token={token} roleLabel={ROLE_LABELS[result.role!]} />
      ) : (
        <div className="surface p-4">
          <p className="font-bold">この招待は使えません</p>
          <p className="mt-2 text-sm text-muted-foreground">
            期限が切れているか、既に使われています。招待した人にもう一度発行してもらってください。
          </p>
        </div>
      )}
    </main>
  );
}
