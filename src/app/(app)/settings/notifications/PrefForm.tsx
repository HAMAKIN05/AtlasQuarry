'use client';

import { useState } from 'react';

import { NOTIFY_EVENT_LABELS, type NotifyEvent } from '@/infra/notifier/types';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';

const CHANNELS = [
  { key: 'web', label: 'アプリ内' },
  { key: 'mail', label: 'メール' },
  { key: 'discord', label: 'Discord' },
] as const;

type Channel = (typeof CHANNELS)[number]['key'];

/**
 * お知らせの受け取り設定。
 *
 * **出来事ごとに、経路を札で選ばせる。** 表（縦に出来事・横に経路のチェックボックス）は
 * スマホで押し間違える。1行1出来事にして、経路は押せる札にする。
 */
export function PrefForm({
  initial,
}: {
  initial: Record<string, Channel[]>;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(event: NotifyEvent, channel: Channel) {
    const current = prefs[event] ?? [];
    const next = current.includes(channel)
      ? current.filter((c) => c !== channel)
      : [...current, channel];

    // 押した瞬間に見た目を変える。失敗したら戻す
    setPrefs((p) => ({ ...p, [event]: next }));
    setBusy(`${event}:${channel}`);
    try {
      await api.patch('/settings/notifications', { event, channels: next });
    } catch {
      setPrefs((p) => ({ ...p, [event]: current }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {(Object.keys(NOTIFY_EVENT_LABELS) as NotifyEvent[]).map((event) => (
        <div key={event} className="card">
          <span className="card-title block">{NOTIFY_EVENT_LABELS[event]}</span>
          <span className="mt-2.5 flex flex-wrap gap-2">
            {CHANNELS.map((c) => {
              const on = (prefs[event] ?? []).includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  disabled={busy === `${event}:${c.key}`}
                  onClick={() => void toggle(event, c.key)}
                  className={cn('chip', on && 'bg-primary text-primary-foreground')}
                >
                  {c.label}
                </button>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
