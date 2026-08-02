import { z } from 'zod';

import { getTaskByKey } from '@/domain/task/service';
import { addWorkLog, listWorkLogs } from '@/domain/worklog/service';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson } from '@/lib/validation';

/** タスクの作業実績（F-17）。 */

export const GET = authed<{ idOrKey: string }>(async ({ params }) => {
  const task = await getTaskByKey(params.idOrKey);
  return ok({ items: await listWorkLogs(task.id) });
});

const bodySchema = z.object({
  minutes: z.number().int().min(1).max(1440),
  workDate: z.string().date().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const POST = authed<{ idOrKey: string }>(async ({ request, actor, meta, params }) => {
  const input = parseOrThrow(bodySchema, await readJson(request));
  const task = await getTaskByKey(params.idOrKey);

  const created = await addWorkLog(
    { ...actor, ip: meta.ip, userAgent: meta.userAgent },
    { taskId: task.id, ...input },
  );

  return ok(created);
});
