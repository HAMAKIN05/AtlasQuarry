import { z } from 'zod';

import { ValidationError } from './errors';
import {
  FEATURE_STATUSES,
  PRODUCT_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/db/schema/enums';

/**
 * 入力検証（技術仕様書 §3.4）。
 *
 * 検証は API 層の入口で行い、ドメイン層は「検証済みの値が来る」前提で書く。
 */

export const uuidSchema = z.uuid('IDの形式が正しくありません');

/** DB設計書 §3.2 の CHECK 制約と同じ条件。DB任せにせず入口で弾いて 400 を返す。 */
export const productKeySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'キーは英大文字で始まる2〜10文字の英数字にしてください');

/** `date` カラム向け。ISO の日付部分のみを受け取る。 */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で指定してください');

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export const featureStatusSchema = z.enum(FEATURE_STATUSES);

/** 前後の空白を落としたうえで空文字を弾く。「   」だけの入力を通さないため。 */
export function requiredText(max: number, message = '入力してください') {
  return z.string().trim().min(1, message).max(max, `${max}文字以内で入力してください`);
}

/** 空文字を null に倒す任意テキスト。フォームの未入力と明示的な空を同じ扱いにする。 */
export function optionalText(max: number) {
  return z
    .string()
    .max(max, `${max}文字以内で入力してください`)
    .transform((v) => {
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    })
    .nullable();
}

/**
 * zod の結果を ValidationError に変換して返す。
 *
 * details にはフィールド別のメッセージを入れる。画面側でフィールドの下に出せるようにするため。
 */
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '_';
    (fieldErrors[path] ??= []).push(issue.message);
  }

  const first = result.error.issues[0];
  throw new ValidationError(first?.message ?? '入力内容に誤りがあります', { fields: fieldErrors });
}

/** リクエストボディを JSON として読む。壊れていれば 400 にする。 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError('リクエストの形式が正しくありません');
  }
}

/** 一覧APIのページング。技術仕様書 §3.2 の meta に対応する。 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Pagination = z.output<typeof paginationSchema>;

export function parsePagination(searchParams: URLSearchParams): Pagination {
  return parseOrThrow(paginationSchema, {
    limit: searchParams.get('limit') ?? undefined,
    offset: searchParams.get('offset') ?? undefined,
  });
}
