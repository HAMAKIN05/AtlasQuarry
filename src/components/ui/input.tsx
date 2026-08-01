import * as React from 'react';

import { cn } from '@/lib/cn';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 高さ 44px はタップ領域の下限。スマホからの入力が主用途
        'flex min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base',
        'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
