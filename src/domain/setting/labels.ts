import { eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { appSetting } from '@/db/schema';
import { DEFAULT_LABELS, mergeLabels, type LabelKey, type Labels } from '@/lib/labels';

/**
 * ステータス・優先度の表示名（設定 → 表示名）。
 *
 * `app_setting` には**既定値との差分だけ**を持つ。全部を持つと、こちらが既定値を
 * 変えたときに古い値で上書きされ続けてしまう。
 */

const SETTING_KEY = 'labels.overrides';

export async function loadLabels(): Promise<Labels> {
  const rows = await db
    .select({ value: appSetting.valueJson })
    .from(appSetting)
    .where(eq(appSetting.key, SETTING_KEY))
    .limit(1);

  const value = rows[0]?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return mergeLabels(null);
  }
  return mergeLabels(value as Record<string, unknown>);
}

/** 設定画面用。既定値と、現在の上書き値の両方を返す。 */
export async function loadLabelOverrides(): Promise<Record<string, string>> {
  const rows = await db
    .select({ value: appSetting.valueJson })
    .from(appSetting)
    .where(eq(appSetting.key, SETTING_KEY))
    .limit(1);

  const value = rows[0]?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && key in DEFAULT_LABELS) out[key] = v;
  }
  return out;
}

/**
 * 表示名を保存する。
 *
 * 既定値と同じ値・空文字は差分に入れない（＝既定値に戻す）。
 */
export async function saveLabels(input: Record<string, string>): Promise<Labels> {
  const overrides: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!(key in DEFAULT_LABELS)) continue;
    const value = raw.trim();
    if (value.length === 0) continue;
    if (value === DEFAULT_LABELS[key as LabelKey]) continue;
    overrides[key] = value;
  }

  await db
    .insert(appSetting)
    .values({ key: SETTING_KEY, valueJson: overrides })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { valueJson: overrides, updatedAt: sql`now()` },
    });

  return mergeLabels(overrides);
}
