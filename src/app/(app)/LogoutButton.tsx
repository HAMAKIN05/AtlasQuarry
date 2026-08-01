'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api/client';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="link-button"
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
      ログアウト
    </button>
  );
}
