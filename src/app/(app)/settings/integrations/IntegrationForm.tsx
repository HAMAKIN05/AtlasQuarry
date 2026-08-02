'use client';

import { useState, type FormEvent } from 'react';

import { Alert, Badge, Field } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api/client';

/**
 * 外部連携の設定（Discord 通知 / メール送信）。
 *
 * **一度入れた値は画面に出さない。** Webhook URL も SMTP のパスワードも
 * 実質的な認証情報なので、「設定済み」とだけ表示して、変えたい人は入れ直す。
 */
export function IntegrationForm({
  initial,
}: {
  initial: { discord: boolean; smtp: boolean };
}) {
  const [state, setState] = useState(initial);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [smtp, setSmtp] = useState({ host: '', port: '587', user: '', pass: '', from: '' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, unknown>, label: string) {
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      await api.post('/settings/integrations', body);
      setDone(`${label}を設定しました`);
      setState((s) => ({ ...s, [body.provider as string]: true }));
      setWebhookUrl('');
      setPublicKey('');
      setSmtp({ host: '', port: '587', user: '', pass: '', from: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存できませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function remove(provider: 'discord' | 'smtp', label: string) {
    if (!window.confirm(`${label}の設定を消します。よろしいですか？`)) return;
    setBusy(true);
    try {
      await api.delete(`/settings/integrations?provider=${provider}`);
      setState((s) => ({ ...s, [provider]: false }));
      setDone(`${label}の設定を消しました`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert>{done}</Alert>}

      <section className="surface flex flex-col gap-4 p-4">
        <h2 className="flex items-center gap-2 text-[17px] font-bold">
          Discord に通知する
          {state.discord && <Badge tone="done">設定済み</Badge>}
        </h2>
        <p className="text-sm text-muted-foreground">
          タスクが割り当てられたときや要望が出されたときに、指定したチャンネルへ流します。
          <strong>Discord からこちらへは何も戻しません。</strong>
        </p>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void save({ provider: 'discord', webhookUrl, publicKey }, 'Discord 通知');
          }}
        >
          <Field
            label="Webhook URL"
            htmlFor="webhook"
            hint="Discord のチャンネル設定 → 連携サービス → ウェブフック で作れます。"
          >
            <Input
              id="webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              autoComplete="off"
              required
            />
          </Field>

          <Field
            label="公開鍵（省略できます）"
            htmlFor="discord-key"
            hint="Discord で /要望 /決定 のコマンドを使うときだけ必要です。Discord Developer Portal のアプリ設定 → General Information → Public Key。"
          >
            <Input
              id="discord-key"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value.trim().toLowerCase())}
              placeholder="64桁の英数字"
              autoComplete="off"
            />
          </Field>

          {publicKey.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Discord 側の Interactions Endpoint URL には、この画面のアドレスの
              <code className="mx-1">/api/discord/interactions</code>
              を入れてください。
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || webhookUrl.length === 0}>
              {state.discord ? '入れ替える' : '設定する'}
            </Button>
            {state.discord && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void remove('discord', 'Discord 通知')}
              >
                やめる
              </Button>
            )}
          </div>
        </form>
      </section>

      <section className="surface flex flex-col gap-4 p-4">
        <h2 className="flex items-center gap-2 text-[17px] font-bold">
          メールで通知する
          {state.smtp && <Badge tone="done">設定済み</Badge>}
        </h2>
        <p className="text-sm text-muted-foreground">
          お使いのメールサーバー（SMTP）を経由して送ります。設定しないと、メールの通知は送られません。
        </p>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void save({ provider: 'smtp', ...smtp, port: Number(smtp.port) }, 'メール送信');
          }}
        >
          <Field label="サーバー" htmlFor="smtp-host">
            <Input
              id="smtp-host"
              value={smtp.host}
              onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
              placeholder="smtp.example.com"
              autoComplete="off"
              required
            />
          </Field>
          <Field label="ポート" htmlFor="smtp-port" hint="ふつうは 587 です。">
            <Input
              id="smtp-port"
              inputMode="numeric"
              value={smtp.port}
              onChange={(e) => setSmtp({ ...smtp, port: e.target.value.replace(/\D/g, '') })}
              required
            />
          </Field>
          <Field label="ユーザー名" htmlFor="smtp-user">
            <Input
              id="smtp-user"
              value={smtp.user}
              onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
              autoComplete="off"
              required
            />
          </Field>
          <Field label="パスワード" htmlFor="smtp-pass">
            <Input
              id="smtp-pass"
              type="password"
              value={smtp.pass}
              onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })}
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="差出人" htmlFor="smtp-from" hint="送信元として表示されるアドレスです。">
            <Input
              id="smtp-from"
              type="email"
              value={smtp.from}
              onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
              autoComplete="off"
              required
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {state.smtp ? '入れ替える' : '設定する'}
            </Button>
            {state.smtp && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void remove('smtp', 'メール送信')}
              >
                やめる
              </Button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
