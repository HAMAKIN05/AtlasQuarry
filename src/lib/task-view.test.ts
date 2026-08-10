import { describe, expect, it } from 'vitest';

import { taskViewQueryString } from './task-view';

describe('taskViewQueryString', () => {
  it('serializes a complete view without client storage', () => {
    expect(taskViewQueryString({
      projectId: 'project-1',
      view: 'board',
      assigneeId: 'actor-1',
      showClosed: true,
      featureId: 'feature-1',
    })).toBe('projectId=project-1&view=board&assigneeId=actor-1&closed=1&featureId=feature-1');
  });

  it('keeps the all-assignees state explicit', () => {
    expect(taskViewQueryString({ projectId: 'project-1', view: 'list' })).toBe(
      'projectId=project-1&view=list&assigneeId=',
    );
  });
});
