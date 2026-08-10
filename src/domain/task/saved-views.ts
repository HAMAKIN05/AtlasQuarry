import { eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { appSetting } from '@/db/schema';
import { ValidationError } from '@/lib/errors';

const KEY_PREFIX = 'saved_task_views:';
const MAX_VIEWS = 24;

export type SavedTaskViewQuery = {
  projectId: string;
  view: 'list' | 'board';
  assigneeId?: string;
  showClosed?: boolean;
  featureId?: string;
};

export type SavedTaskView = {
  id: string;
  name: string;
  query: SavedTaskViewQuery;
  createdAt: string;
};

function settingKey(actorId: string): string {
  return `${KEY_PREFIX}${actorId}`;
}

function normalize(value: unknown): SavedTaskView[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const rawQuery = item.query;
      const query = rawQuery && typeof rawQuery === 'object' ? rawQuery as Record<string, unknown> : {};
      const projectId = typeof query.projectId === 'string' ? query.projectId : '';
      const view = query.view === 'board' ? 'board' : 'list';
      return {
        id: typeof item.id === 'string' ? item.id : '',
        name: typeof item.name === 'string' ? item.name : '',
        query: {
          projectId,
          view,
          ...(typeof query.assigneeId === 'string' ? { assigneeId: query.assigneeId } : {}),
          ...(query.showClosed === true ? { showClosed: true } : {}),
          ...(typeof query.featureId === 'string' ? { featureId: query.featureId } : {}),
        },
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
      } satisfies SavedTaskView;
    })
    .filter((item) => item.id.length > 0 && item.name.length > 0 && item.query.projectId.length > 0)
    .slice(0, MAX_VIEWS);
}

async function load(actorId: string): Promise<SavedTaskView[]> {
  const rows = await db
    .select({ value: appSetting.valueJson })
    .from(appSetting)
    .where(eq(appSetting.key, settingKey(actorId)))
    .limit(1);

  return normalize(rows[0]?.value);
}

async function save(actorId: string, views: SavedTaskView[]): Promise<void> {
  await db
    .insert(appSetting)
    .values({ key: settingKey(actorId), valueJson: views.slice(0, MAX_VIEWS) })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { valueJson: views.slice(0, MAX_VIEWS), updatedAt: sql`now()` },
    });
}

export async function listSavedTaskViews(actorId: string): Promise<SavedTaskView[]> {
  return load(actorId);
}

export async function createSavedTaskView(
  actorId: string,
  input: { name: string; query: SavedTaskViewQuery },
): Promise<SavedTaskView> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 40) {
    throw new ValidationError('ビュー名は1〜40文字で入力してください。');
  }
  if (!input.query.projectId) {
    throw new ValidationError('プロジェクトを選択してください。');
  }

  const view: SavedTaskView = {
    id: crypto.randomUUID(),
    name,
    query: input.query,
    createdAt: new Date().toISOString(),
  };
  const current = await load(actorId);
  await save(actorId, [view, ...current.filter((item) => item.name !== name)]);
  return view;
}

export async function deleteSavedTaskView(actorId: string, id: string): Promise<void> {
  const current = await load(actorId);
  await save(actorId, current.filter((item) => item.id !== id));
}
