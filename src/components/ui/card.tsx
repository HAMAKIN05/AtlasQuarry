import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * 面の基本単位。
 *
 * **枠線を引かない。** 背景の明度差と上端 1px のハイライト（.surface）で持ち上げる。
 * 枠を全部に引くと平坦で安っぽくなる。
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('surface', className)} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-1', className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="card-title"
      className={cn('text-[0.95rem] font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('p-4', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex flex-wrap items-center gap-2 px-4 pb-4', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
