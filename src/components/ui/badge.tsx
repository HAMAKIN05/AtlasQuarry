import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * 状態を表す小さな札。
 *
 * 色は意味と結び付ける。進行中＝アクセント、完了＝緑、要注意＝黄、超過＝赤、
 * 止まっているもの＝枠だけ。増やすときはこの対応を崩さないこと。
 */
const badgeVariants = cva(
  'inline-flex items-center shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        progress: 'bg-accent text-accent-foreground',
        done: 'bg-success-soft text-success',
        warn: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-destructive',
        muted: 'border text-muted-foreground',
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
