import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { task } from '@/db/schema';
import { createTaskComment } from '@/domain/comment/service';
import { getDocument, listDocuments } from '@/domain/document/service';
import { listProducts } from '@/domain/product/service';
import { search } from '@/domain/search/service';
import { getTaskByKey, listTasks, updateTask } from '@/domain/task/service';
import { NotFoundError, ValidationError } from '@/lib/errors';

import { assertProductAllowed, assertWritable, toActorContext, type McpAuth } from './auth';

/**
 * MCP が公開する道具（F-18）。
 *
 * 使うのは**このプロジェクトの AI エージェント**で、人間は直接触らない。
 *
 * **危ないものは出さない。** 削除・権限変更・メンバー管理・設定変更は含めない。
 * 鍵が漏れたときの被害を「担当タスクを進める」「気づいたことを書く」の範囲に閉じる。
 *
 * **業務のロジックはここに書かない。** 既存のドメイン層をそのまま呼ぶ。
 * MCP 専用の抜け道を作ると、画面から通らない書き込みが生まれる。
 */

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

function textResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export const TOOLS = [
  {
    name: 'list_projects',
    description: 'プロジェクトの一覧と進捗を返す。',
    write: false,
    schema: z.object({}),
  },
  {
    name: 'list_tasks',
    description:
      'タスクを絞り込んで返す。projectId は list_projects の id。status は未指定なら未完了のみ。',
    write: false,
    schema: z.object({
      projectId: z.string().uuid().optional(),
      status: z.array(z.string()).optional(),
      assigneeId: z.string().uuid().optional(),
    }),
  },
  {
    name: 'get_task',
    description: 'タスクの詳細を、タスクキー（例 P1-3）で返す。',
    write: false,
    schema: z.object({ key: z.string().min(1) }),
  },
  {
    name: 'search',
    description: 'タスク・要望・資料を横断して検索する。2文字以上。',
    write: false,
    schema: z.object({ query: z.string().min(2) }),
  },
  {
    name: 'list_documents',
    description: 'そのプロジェクトの資料（仕様・覚え書き・議事録）の一覧を返す。',
    write: false,
    schema: z.object({ projectId: z.string().uuid() }),
  },
  {
    name: 'get_document',
    description: '資料の本文を返す。',
    write: false,
    schema: z.object({ id: z.string().uuid() }),
  },
  {
    name: 'update_task_status',
    description:
      'タスクの状態を変える。**自分に割り当てられたタスクだけ**変えられる。' +
      'status は backlog / todo / in_progress / review / done / cancelled。',
    write: true,
    schema: z.object({
      key: z.string().min(1),
      status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']),
    }),
  },
  {
    name: 'add_comment',
    description: 'タスクにコメントを書く。作業の経緯や気づいたことを残す用。',
    write: true,
    schema: z.object({ key: z.string().min(1), body: z.string().min(1).max(4000) }),
  },
] as const;

export type ToolName = (typeof TOOLS)[number]['name'];

export function toolList() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema),
  }));
}

/** Zod をそのまま JSON Schema にする最小の変換。**ライブラリは足さない。** */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape ?? {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const isOptional = value.isOptional();
    const inner = isOptional ? (value as unknown as { unwrap(): z.ZodTypeAny }).unwrap() : value;
    const typeName = inner.constructor.name;

    properties[key] =
      typeName === 'ZodArray'
        ? { type: 'array', items: { type: 'string' } }
        : typeName === 'ZodEnum'
          ? { type: 'string', enum: (inner as unknown as { options: string[] }).options }
          : { type: 'string' };

    if (!isOptional) required.push(key);
  }

  return { type: 'object', properties, required };
}

export async function callTool(
  auth: McpAuth,
  name: string,
  args: Record<string, unknown>,
  ip: string | null,
): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new ValidationError(`知らない道具です: ${name}`);

  if (tool.write) assertWritable(auth);

  const input = tool.schema.parse(args ?? {}) as unknown as Record<string, unknown>;
  const ctx = toActorContext(auth, ip);

  switch (name) {
    case 'list_projects': {
      const products = await listProducts();
      const visible = products.filter(
        (p) => auth.productIds === null || auth.productIds.includes(p.id),
      );
      return textResult(
        visible.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          done: p.progress.doneTasks,
          total: p.progress.totalTasks,
          nextDueDate: p.nextDueDate,
        })),
      );
    }

    case 'list_tasks': {
      const projectId = (input.projectId as string | undefined);
      if (projectId) assertProductAllowed(auth, projectId);

      const tasks = await listTasks({
        productId: projectId,
        status: (input.status as never) ?? [
          'backlog',
          'todo',
          'in_progress',
          'review',
        ],
        assigneeId: (input.assigneeId as string | undefined),
      });

      const visible = tasks.filter(
        (t) => auth.productIds === null || auth.productIds.includes(t.productId),
      );

      return textResult(
        visible.map((t) => ({
          key: t.key,
          title: t.title,
          status: t.status,
          priority: t.priority,
          assignee: t.assigneeName,
          project: t.productName,
          startDate: t.startDate,
          dueDate: t.dueDate,
        })),
      );
    }

    case 'get_task': {
      const found = await getTaskByKey((input.key as string));
      assertProductAllowed(auth, found.productId);
      return textResult({
        key: found.key,
        title: found.title,
        body: found.bodyMd,
        status: found.status,
        priority: found.priority,
        assignee: found.assigneeName,
        project: found.productName,
        startDate: found.startDate,
        dueDate: found.dueDate,
      });
    }

    case 'search': {
      const hits = await search((input.query as string));
      return textResult(hits.map((h) => ({ kind: h.kind, title: h.title, url: h.url, snippet: h.snippet })));
    }

    case 'list_documents': {
      const projectId = (input.projectId as string);
      assertProductAllowed(auth, projectId);
      const docs = await listDocuments(projectId);
      return textResult(
        docs.map((d) => ({ id: d.id, title: d.title, type: d.type, confirmed: d.isConfirmed })),
      );
    }

    case 'get_document': {
      const doc = await getDocument((input.id as string));
      if (doc.productId) assertProductAllowed(auth, doc.productId);
      return textResult({ title: doc.title, type: doc.type, body: doc.bodyMd });
    }

    case 'update_task_status': {
      const key = input.key as string;
      const status = input.status as string;
      const found = await getTaskByKey(key);
      assertProductAllowed(auth, found.productId);
      // agent は自分に割当済のタスクだけ更新できる（技術仕様書 §2.6）。ドメイン側で弾く
      const updated = await updateTask(ctx, found.id, { status: status as never });
      return textResult({ key: found.key, status: updated.status });
    }

    case 'add_comment': {
      const key = input.key as string;
      const body = input.body as string;
      const found = await getTaskByKey(key);
      assertProductAllowed(auth, found.productId);

      const [exists] = await db.select({ id: task.id }).from(task).where(eq(task.id, found.id)).limit(1);
      if (!exists) throw new NotFoundError('タスクが見つかりません', 'TASK_NOT_FOUND');

      const created = await createTaskComment(ctx, found.id, body);
      return textResult({ commentId: created.id });
    }

    default:
      throw new ValidationError(`知らない道具です: ${name}`);
  }
}
