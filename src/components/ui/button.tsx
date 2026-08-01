import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * shadcn/ui の Button をこのプロジェクト向けに調整したもの。
 *
 * **既定の高さは 44px 以上。** スマホからの操作が主用途で、タップ領域の下限を割らない。
 * sm も高さは保つ（見た目を小さくしたいだけで、押しにくくしたいわけではない）。
 *
 * 主操作にだけ淡い発光を乗せている。ダーク上では影が効かないぶん、
 * 光で手前に出す方が「押せるもの」として読み取りやすい。
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md whitespace-nowrap',
    'text-[0.88rem] font-semibold transition-all duration-150',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:pointer-events-none disabled:opacity-45',
  "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_0_0_1px_var(--primary-line),0_2px_10px_-2px_var(--primary-soft)] hover:bg-primary-hover',
        outline: 'bg-raised text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-hover',
        destructive:
          'bg-destructive-soft text-destructive shadow-[inset_0_0_0_1px_oklch(0.68_0.19_20/0.35)] hover:bg-destructive/20',
        ghost: 'text-muted-foreground hover:bg-raised hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-11 px-4',
        sm: 'min-h-11 px-3 text-[0.82rem]',
        lg: 'min-h-12 px-6 text-[0.95rem]',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
