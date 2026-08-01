import { eq } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { activity, appSetting } from '@/db/schema';
import type { ActivityAction, EntityType } from '@/db/schema/enums';

/**
 * アクティビティ記録（技術仕様書 §6、CLAUDE.md 絶対ルール §3）。
 *
 * activity は3つの機能を兼ねる唯一のデータソースであり、記録漏れは機能の欠損に直結する。
 * 1. 変更履歴  2. ヒートマップの濃淡（F-16）  3. タスク詳細のタイムライン（S-06）
 *
 * **必ずミューテーションと同一トランザクション内で呼ぶこと。** 引数が `Transaction` で
 * `Database` を受け付けないのはそのため。別トランザクションにすると、本体が成功して記録だけ
 * 失われるケースが生じる。
 *
 * このモジュールは INSERT しか行わない。activity への UPDATE / DELETE は書かないこと。
 */

const WEIGHTS_SETTING_KEY = 'activity.weights';

/** app_setting が読めなかった場合の保険。通常は DB の値が使われる。 */
const FALLBACK_WEIGHTS: Record<string, number> = {
  complete: 5,
  'document.create': 3,
  'document.update': 3,
  create: 2,
  update: 2,
  triage: 2,
  comment: 1,
  status_change: 1,
};

export type RecordActivityParams = {
  actorId: string;
  entityType: EntityType;
  entityId: string;
  action: ActivityAction;
  /** 変更前後の差分。秘匿情報（トークン・パスワードハッシュ等）を入れないこと。 */
  diff?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * 重み表を app_setting から読む。ハードコードしない（技術仕様書 §6.2）。
 *
 * 同一トランザクション内で読むため、設定変更と記録の間で不整合が起きない。
 */
async function loadWeights(tx: Transaction): Promise<Record<string, number>> {
  const rows = await tx
    .select({ value: appSetting.valueJson })
    .from(appSetting)
    .where(eq(appSetting.key, WEIGHTS_SETTING_KEY))
    .limit(1);

  const value = rows[0]?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return FALLBACK_WEIGHTS;
  }

  const parsed: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      parsed[key] = raw;
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : FALLBACK_WEIGHTS;
}

/**
 * 重みを解決する。
 *
 * ドキュメントだけ `document.create` / `document.update` のようにエンティティ別の重みを持つため、
 * `{entityType}.{action}` を先に見て、無ければ `{action}` にフォールバックする。
 */
function resolveWeight(
  weights: Record<string, number>,
  entityType: EntityType,
  action: ActivityAction,
): number {
  return weights[`${entityType}.${action}`] ?? weights[action] ?? 1;
}

/**
 * activity に1件記録する。
 *
 * weight には**記録時点の**重みを保存する。後から重みを変えても過去のヒートマップが
 * 揺れないようにするため（技術仕様書 §6.2）。
 */
export async function recordActivity(
  tx: Transaction,
  params: RecordActivityParams,
): Promise<void> {
  const weights = await loadWeights(tx);

  await tx.insert(activity).values({
    actorId: params.actorId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    diffJson: params.diff ?? null,
    weight: resolveWeight(weights, params.entityType, params.action),
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
  });
}

/**
 * 複数件をまとめて記録する。重み表の読み込みが1回で済む。
 *
 * 「ステータス変更 + 完了」のように1操作で2件記録したい場合に使う。
 */
export async function recordActivities(
  tx: Transaction,
  entries: readonly RecordActivityParams[],
): Promise<void> {
  if (entries.length === 0) return;
  const weights = await loadWeights(tx);

  await tx.insert(activity).values(
    entries.map((params) => ({
      actorId: params.actorId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      diffJson: params.diff ?? null,
      weight: resolveWeight(weights, params.entityType, params.action),
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    })),
  );
}

/**
 * 変更前後から差分を作る。値が変わったキーだけを {before, after} で残す。
 *
 * activity.diff_json に入るため、**秘匿情報を含むフィールドを渡さないこと。**
 */
export function buildDiff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const [key, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const prev = before[key];
    if (!Object.is(normalize(prev), normalize(next))) {
      diff[key] = { before: normalize(prev), after: normalize(next) };
    }
  }
  return diff;
}

/** Date と undefined を JSON で比較できる形に揃える。 */
function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}
