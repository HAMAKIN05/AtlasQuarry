'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api/client';

/**
 * 議事録の確定・確定解除（F-23）。
 *
 * **確定＝「この内容で決まった」という宣言。** 確定すると書き換えられなくなる。
 * あとから中身が変わると、決まったことの記録として使えないため。
 */
export function MinutesActions({ id, confirmed }: { id: string; confirmed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (confirmed && !window.confirm('確定を外すと、また書き換えられるようになります。よろしいですか？')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/documents/${id}`, { isConfirmed: !confirmed });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '変えられませんでした');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button type="button" variant={confirmed ? 'ghost' : 'default'} disabled={busy} onClick={() => void toggle()}>
        {confirmed ? '確定を外す' : 'この内容で確定する'}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
