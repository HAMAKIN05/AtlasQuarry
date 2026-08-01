import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * クラス名の結合。後から渡したものが勝つように tailwind-merge で正規化する。
 *
 * `cn('p-2', condition && 'p-4')` のように書けて、競合する Tailwind クラスは
 * 後勝ちで1つに畳まれる。shadcn/ui のコンポーネントがこれを前提にしている。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
