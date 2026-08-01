import { z } from 'zod';

import { createTask, listTasks, type TaskFilter } from '@/domain/task/service';
import { authed, ok } from '@/lib/api/handler';
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
import { TASK_STATUSES } from '@/db/schema/enums';

const createSchema = z.object({
  productId: uuidSchema,
  featureId: uuidSchema.nullable().optional().default(null),
  parentTaskId: uuidSchema.nullable().optional().default(null),
  title: requiredText(200, 'タイトルを入力してください'),
  bodyMd: optionalText(20000).optional().default(null),
  status: taskStatusSchema.optional().default('backlog'),
  priority: taskPrioritySchema.optional().default('normal'),
  assigneeId: uuidSchema.nullable().optional().default(null),
  estimateMinutes: z.number().int().positive().nullable().optional().default(null),
  startDate: dateSchema.nullable().optional().default(null),
  dueDate: dateSchema.nullable().optional().default(null),
});

/**
 * GET /api/v1/tasks
 *
 * ?productId= &status= &assigneeId= &featureId=
 * status はカンマ区切りで複数指定できる。featureId=none は「開発項目なし」の絞り込み。
 */
export const GET = authed(async ({ request }) => {
  const params = new URL(request.url).searchParams;
  const filter: TaskFilter = {};

  const productId = params.get('productId');
  if (productId) filter.productId = parseOrThrow(uuidSchema, productId);

  const assigneeId = params.get('assigneeId');
  if (assigneeId) filter.assigneeId = parseOrThrow(uuidSchema, assigneeId);

  const status = params.get('status');
  if (status) {
    filter.status = parseOrThrow(z.array(z.enum(TASK_STATUSES)).min(1), status.split(','));
  }

  const featureId = params.get('featureId');
  if (featureId === 'none') filter.featureId = null;
  else if (featureId) filter.featureId = parseOrThrow(uuidSchema, featureId);

  return ok(await listTasks(filter));
});

/** POST /api/v1/tasks */
export const POST = authed(async ({ request, actor, meta }) => {
  const input = parseOrThrow(createSchema, await readJson(request));
  const created = await createTask({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, input);
  return ok(created, 201);
});
