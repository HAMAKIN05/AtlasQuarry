'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Dot } from '@/components/Ledger';
import { Badge, Progress } from '@/components/app-ui';
import type { ProductSummary } from '@/domain/product/service';
import { formatDate } from '@/lib/format';
import { PROJECT_STATUS_LABELS } from '@/lib/labels';

type ProjectItem = {
  project: ProductSummary;
  open: number;
  overdue: number;
  unassigned: number;
};

type Scope = 'all' | 'active' | 'archive';

export function ProjectCatalog({ items }: { items: ProjectItem[] }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('active');
  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return items.filter(({ project }) => {
      const matchesScope = scope === 'all'
        || (scope === 'active' && (project.status === 'active' || project.status === 'planning'))
        || (scope === 'archive' && project.status !== 'active' && project.status !== 'planning');
      const matchesQuery = normalized.length === 0
        || `${project.name} ${project.key} ${project.description ?? ''}`.toLowerCase().includes(normalized);
      return matchesScope && matchesQuery;
    });
  }, [items, normalized, scope]);

  return (
    <section className="project-catalog" aria-label="プロジェクト一覧">
      <div className="project-catalog-toolbar">
        <label className="project-catalog-search">
          <span className="sr-only">プロジェクトを検索</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="プロジェクトを検索" />
        </label>
        <div className="project-scope-tabs" role="tablist" aria-label="プロジェクトの範囲">
          {([
            ['active', '進行中'],
            ['all', 'すべて'],
            ['archive', '完了・停止'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scope === value}
              className={scope === value ? 'is-active' : undefined}
              onClick={() => setScope(value)}
            >
              {label}
              <span>{items.filter(({ project }) => value === 'all' || (value === 'active' ? project.status === 'active' || project.status === 'planning' : project.status !== 'active' && project.status !== 'planning')).length}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="project-catalog-empty">条件に合うプロジェクトがありません。</p>
      ) : (
        <div className="project-catalog-list">
          <div className="project-catalog-head" aria-hidden="true">
            <span>プロジェクト（押すとかんばん）</span><span>進捗</span><span>未完了</span><span>次の期限</span><span>詳細</span>
          </div>
          {visible.map(({ project, open, overdue, unassigned }) => (
            <div key={project.id} className="project-catalog-row">
              <Link
                href={`/tasks?projectId=${project.id}&view=board`}
                className="project-catalog-identity project-catalog-board-link"
                aria-label={`${project.name}のかんばんを開く`}
              >
                <Dot seed={project.key} />
                <span className="min-w-0">
                  <strong>{project.name}</strong>
                  <small>{project.key} ・ {PROJECT_STATUS_LABELS[project.status]}</small>
                </span>
              </Link>
              <span className="project-catalog-progress"><Progress done={project.progress.doneTasks} total={project.progress.totalTasks} /></span>
              <span className="project-catalog-open">
                <strong>{open}</strong>
                {(overdue > 0 || unassigned > 0) && <small>{overdue > 0 ? `期限超過 ${overdue}` : `担当未定 ${unassigned}`}</small>}
              </span>
              <span className={project.nextDueDate && overdue > 0 ? 'project-catalog-due is-late' : 'project-catalog-due'}>
                {project.nextDueDate ? formatDate(project.nextDueDate) : '期限なし'}
              </span>
              <Link href={`/projects/${project.id}`} className="project-catalog-detail-link">詳細</Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
