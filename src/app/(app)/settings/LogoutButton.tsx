'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';

/**
 * ログアウト。
 *
 * **上部バーから設定画面の最下部へ移した。** 毎画面の右上に置くと、
 * 名前の隣に並ぶせいで誤って押しやすく、幅も食う。3人が毎日使う道具で
 * ログアウトは日常操作ではない。
 */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-5">
      <p className="text-sm text-muted-foreground">
        ログアウトすると、次に開いたときにメールアドレスとパスワードが要ります。
      </p>
      <Button
        type="button"
        variant="ghost"
        className="self-start text-destructive"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.post('/auth/logout');
          } finally {
            // 通信に失敗しても画面はログインへ送る。セッションが生きていれば再度弾かれるだけ
            router.replace('/login');
            router.refresh();
          }
        }}
      >
        {busy ? 'ログアウトしています…' : 'ログアウト'}
      </Button>
    </div>
  );
}
