'use client';

import { useState } from 'react';

import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

/**
 * ログインと登録の切り替え。
 *
 * **登録を別画面にしない。** 初めて来た人がまず見るのはログイン画面で、
 * そこに入口が無いと「どこから始めるのか」が分からない。
 * 登録はログイン画面から切り替えられ、登録後は全員が管理者として使い始められる。
 */
export function AuthPanel() {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  if (mode === 'register') {
    return <RegisterForm onDone={() => setMode('login')} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <LoginForm />
      <p className="text-center text-sm text-muted-foreground">
        はじめて使う方は
        <button
          type="button"
          onClick={() => setMode('register')}
          className="ml-1 min-h-11 font-semibold text-primary underline-offset-2 hover:underline"
        >
          アカウントを作る
        </button>
      </p>
    </div>
  );
}
