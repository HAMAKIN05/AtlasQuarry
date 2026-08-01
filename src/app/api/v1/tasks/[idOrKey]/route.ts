import { z } from 'zod';

import { deleteTask, getTaskByKey, updateTask } from '@/domain/task/service';
import { authed, noContent, ok } from '@/lib/api/handler';
import {
  dateSchema,
  optionalText,
  parseOrThrow,
  readJson,
  requiredText,
  taskPrioritySchema,
  taskStatusSchema,
  uuidSchema,
} from '@/lib/validation';

/**
 * v0.1スコープ §4 に合わせ、GET はキー（PRD-12）、PATCH / DELETE は UUID を受ける。
 * セグメント名を idOrKey にしているのは、その使い分けをファイル名から分かるようにするため。
 */
type Params = { idOrKey: string };

const updateSchema = z
  .object({
    title: requiredText(200).optional(),
    bodyMd: optionalText(20000).optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    assigneeId: uuidSchema.nullable().optional(),
    featureId: uuidSchema.nullable().optional(),
    estimateMinutes: z.number().int().positive().nullable().optional(),
    startDate: dateSchema.nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '変更内容がありません' });

/** GET /api/v1/tasks/:key */
export const GET = authed<Params>(async ({ params }) => ok(await getTaskByKey(params.idOrKey)));

/** PATCH /api/v1/tasks/:id */
export const PATCH = authed<Params>(async ({ request, actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.idOrKey);
  const input = parseOrThrow(updateSchema, await readJson(request));
  return ok(await updateTask({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, id, input));
});

/** DELETE /api/v1/tasks/:id。developer は削除できない（受入基準 5.3）。 */
export const DELETE = authed<Params>(async ({ actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.idOrKey);
  await deleteTask({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, id);
  return noContent();
});
