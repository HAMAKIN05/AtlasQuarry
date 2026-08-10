import type { SavedTaskViewQuery } from '@/domain/task/saved-views';

export function taskViewQueryString(query: SavedTaskViewQuery): string {
  const params = new URLSearchParams({ projectId: query.projectId, view: query.view });
  params.set('assigneeId', query.assigneeId ?? '');
  if (query.showClosed) params.set('closed', '1');
  if (query.featureId) params.set('featureId', query.featureId);
  return params.toString();
}
