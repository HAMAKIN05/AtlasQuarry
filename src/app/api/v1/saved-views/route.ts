import { z } from 'zod';

import {
  createSavedTaskView,
  deleteSavedTaskView,
  listSavedTaskViews,
} from '@/domain/task/saved-views';
import { authed, noContent, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson } from '@/lib/validation';

const querySchema = z.object({
  projectId: z.string().min(1),
  view: z.enum(['list', 'board']).default('list'),
  assigneeId: z.string().optional(),
  showClosed: z.boolean().optional(),
  featureId: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(40),
  query: querySchema,
});

const deleteSchema = z.object({ id: z.string().uuid() });

export const GET = authed(async ({ actor }) => ok(await listSavedTaskViews(actor.id)));

export const POST = authed(async ({ request, actor }) => {
  const input = parseOrThrow(createSchema, await readJson(request));
  return ok(await createSavedTaskView(actor.id, input), 201);
});

export const DELETE = authed(async ({ request, actor }) => {
  const input = parseOrThrow(deleteSchema, await readJson(request));
  await deleteSavedTaskView(actor.id, input.id);
  return noContent();
});
