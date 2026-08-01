import { z } from 'zod';

import { createTaskComment, listTaskComments } from '@/domain/comment/service';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson, requiredText, uuidSchema } from '@/lib/validation';

type Params = { idOrKey: string };

const createSchema = z.object({
  bodyMd: requiredText(20000, 'コメントを入力してください'),
});

/** GET /api/v1/tasks/:id/comments */
export const GET = authed<Params>(async ({ params }) => {
  const taskId = parseOrThrow(uuidSchema, params.idOrKey);
  return ok(await listTaskComments(taskId));
});

/** POST /api/v1/tasks/:id/comments */
export const POST = authed<Params>(async ({ request, actor, params, meta }) => {
  const taskId = parseOrThrow(uuidSchema, params.idOrKey);
  const input = parseOrThrow(createSchema, await readJson(request));

  const created = await createTaskComment(
    { ...actor, ip: meta.ip, userAgent: meta.userAgent },
    taskId,
    input.bodyMd,
  );
  return ok(created, 201);
});
