import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * プロジェクトを作る画面への導線。
 *
 * **その場で開くフォームをやめ、専用の画面へ送る。** 見出しの脇の狭い枠に
 * 入力欄が開いて右へはみ出す作りだった（要望・タスクで直したのと同じ形）。
 */
export function NewProjectButton() {
  return (
    <Button asChild>
      <Link href="/projects/new">プロジェクトを作る</Link>
    </Button>
  );
}
