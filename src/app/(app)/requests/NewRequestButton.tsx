import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * 要望を出す画面への導線。
 *
 * **その場で開くフォームをやめ、専用の画面へ送る。** 見出しの脇の狭い枠に
 * 入力欄が開き、下には一覧が残ったまま、という作りが使いにくかった。
 */
export function NewRequestButton() {
  return (
    <Button asChild>
      <Link href="/requests/new">要望を出す</Link>
    </Button>
  );
}
