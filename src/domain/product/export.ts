import { asc, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor, document } from '@/db/schema';
import { getProductById } from '@/domain/product/service';
import { loadLabels } from '@/domain/setting/labels';
import { formatMinutes } from '@/domain/worklog/service';
import type { Labels } from '@/lib/labels';

/**
 * 書き出し（F-19 Markdown / F-21 表計算）。
 *
 * **プロジェクト一式を1ファイルで出す。** 資料1件ずつ落とせるようにしても、
 * 引き継ぎのときに必要なのは「この案件の全部」で、何度も押させることになる。
 * zip はライブラリ無しでは作れないので、1つの `.md` に束ねる。
 *
 * **Excel は CSV で出す。** xlsx を作るには依存を足すことになるが、
 * 経営者が Excel でやるのは並べ替えと集計で、装飾も数式も要らない。
 * **BOM を付ける**――付けないと Excel が Shift_JIS と誤認して日本語が化ける。
 */

function esc(value: string | null): string {
  if (!value) return '';
  // CSV は " を "" で逃がす。改行はセル内に残せるが、表計算で扱いにくいので空白にする
  return `"${value.replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;
}

const CSV_HEADER = [
  'プロジェクト',
  'タスク番号',
  'タスク名',
  '状態',
  '担当者',
  '優先度',
  '開始日',
  '期限',
  '見積(分)',
  '実績(分)',
  'AI実行(分)',
  '作成日',
] as const;

type ExportRow = {
  key: string;
  title: string;
  status: string;
  assigneeName: string | null;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  humanMinutes: number;
  agentMinutes: number;
  createdAt: Date;
};

async function loadRows(productId: string): Promise<ExportRow[]> {
  const rows = await db.execute(sql`
    select t.key, t.title, t.status, t.priority, t.start_date, t.due_date,
           t.estimate_minutes, t.created_at, a.name as assignee_name,
           coalesce(sum(w.minutes) filter (where w.source = 'manual'), 0)::int as human_minutes,
           coalesce(sum(w.minutes) filter (where w.source = 'agent'), 0)::int  as agent_minutes
      from task t
      left join actor a on a.id = t.assignee_id
      left join work_log w on w.task_id = t.id
     where t.product_id = ${productId}
     group by t.id, t.key, t.title, t.status, t.priority, t.start_date, t.due_date,
              t.estimate_minutes, t.created_at, a.name
     order by t.key
  `);

  const list = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];

  return list.map((row) => ({
    key: row.key as string,
    title: row.title as string,
    status: row.status as string,
    assigneeName: (row.assignee_name as string | null) ?? null,
    priority: row.priority as string,
    startDate: (row.start_date as string | null) ?? null,
    dueDate: (row.due_date as string | null) ?? null,
    estimateMinutes: (row.estimate_minutes as number | null) ?? null,
    humanMinutes: Number(row.human_minutes),
    agentMinutes: Number(row.agent_minutes),
    createdAt: new Date(row.created_at as string),
  }));
}

/** ファイル名に使えない文字を落とす。プロジェクト名は日本語のまま残す。 */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
}

function todayJst(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function statusLabel(labels: Labels, status: string): string {
  return labels[`task.status.${status}` as keyof Labels] ?? status;
}

export type ExportFile = { filename: string; contentType: string; body: string };

/** F-21 タスク一覧の CSV。**Excel で開く前提**なので UTF-8 BOM を付ける。 */
export async function exportProjectCsv(productId: string): Promise<ExportFile> {
  const [project, rows, labels] = await Promise.all([
    getProductById(productId),
    loadRows(productId),
    loadLabels(),
  ]);

  const lines = [
    CSV_HEADER.join(','),
    ...rows.map((r) =>
      [
        esc(project.name),
        esc(r.key),
        esc(r.title),
        esc(statusLabel(labels, r.status)),
        esc(r.assigneeName),
        esc(labels[`task.priority.${r.priority}` as keyof Labels] ?? r.priority),
        esc(r.startDate),
        esc(r.dueDate),
        r.estimateMinutes ?? '',
        r.humanMinutes || '',
        r.agentMinutes || '',
        esc(r.createdAt.toISOString().slice(0, 10)),
      ].join(','),
    ),
  ];

  return {
    filename: `${safeName(project.name)}_${todayJst()}.csv`,
    contentType: 'text/csv; charset=utf-8',
    // ﻿ が BOM。これが無いと Excel が日本語を化けさせる
    body: `﻿${lines.join('\r\n')}\r\n`,
  };
}

/** F-19 プロジェクト一式の Markdown（資料 + タスク一覧）。 */
export async function exportProjectMarkdown(productId: string): Promise<ExportFile> {
  const [project, rows, labels] = await Promise.all([
    getProductById(productId),
    loadRows(productId),
    loadLabels(),
  ]);

  const docs = await db
    .select({
      title: document.title,
      type: document.type,
      bodyMd: document.bodyMd,
      meetingDate: document.meetingDate,
      isConfirmed: document.isConfirmed,
      authorName: actor.name,
    })
    .from(document)
    .innerJoin(actor, eq(actor.id, document.createdBy))
    .where(eq(document.productId, productId))
    .orderBy(asc(document.position));

  const out: string[] = [
    `# ${project.name}`,
    '',
    project.description ? `${project.description}\n` : '',
    `書き出し日：${todayJst()}`,
    '',
    '## タスク',
    '',
    '| 番号 | タスク | 状態 | 担当 | 期限 | 見積 | 実績 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) =>
      [
        r.key,
        r.title.replace(/\|/g, '\\|'),
        statusLabel(labels, r.status),
        r.assigneeName ?? '—',
        r.dueDate ?? '—',
        r.estimateMinutes ? formatMinutes(r.estimateMinutes) : '—',
        r.humanMinutes ? formatMinutes(r.humanMinutes) : '—',
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
    ),
    '',
  ];

  if (docs.length > 0) {
    out.push('## 資料', '');
    for (const doc of docs) {
      const label = doc.type === 'minutes' ? '議事録' : doc.type === 'spec' ? '仕様' : '覚え書き';
      out.push(`### ${doc.title}`, '');
      out.push(
        `${label}${doc.meetingDate ? ` / 開催 ${doc.meetingDate}` : ''}` +
          `${doc.isConfirmed ? ' / 確定済み' : ''} / ${doc.authorName}`,
        '',
      );
      out.push(doc.bodyMd || '（本文なし）', '');
    }
  }

  return {
    filename: `${safeName(project.name)}_${todayJst()}.md`,
    contentType: 'text/markdown; charset=utf-8',
    body: out.join('\n'),
  };
}
