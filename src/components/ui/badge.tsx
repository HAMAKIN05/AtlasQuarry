import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * 状態を表す小さな札。
 *
 * ダークでは**塗りではなく「淡い地＋その色の文字」**にする。塗ると彩度が勝ちすぎて
 * 画面がうるさくなり、どれが主操作か分からなくなる。
 *
 * 色は意味と結び付ける。進行中＝アクセント、完了＝緑、要注意＝黄、超過＝赤、
 * 止まっているもの＝地なし。増やすときはこの対応を崩さないこと。
 */
const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.72rem] font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-raised text-muted-foreground',
        progress: 'bg-primary-soft text-primary',
        done: 'bg-success-soft text-success',
        warn: 'bg-warning-soft text-warning',
        danger: 'bg-destructive-soft text-destructive',
        muted: 'text-subtle shadow-[inset_0_0_0_1px_var(--border)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

function Badge({
  className,
  tone,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';
  return <Comp data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
