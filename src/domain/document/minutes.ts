import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor, decisionNote, document } from '@/db/schema';
import { recordActivity } from '@/domain/activity/recorder';
import type { ActorContext } from '@/domain/actor-context';
import { createTask } from '@/domain/task/service';
import { assertCan } from '@/lib/auth/rbac';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';

/**
 * 議事録まわりの転記（F-24 の取り込み / F-25 の行→タスク）。
 *
 * **転記の手間はわざと残す**（機能定義書 §9.1）。Discord の決定事項を議事録へ
 * 自動追記せず、議事録の行からタスクを自動起票もしない。人が選んだものだけを通す。
 * 全自動にすると「結局何が決まったのか」を言語化する場が消える。
 *
 * **確定済みの議事録は触らない。** 確定＝この内容で決まったという宣言なので、
 * あとから決定事項を差し込めると記録として使えなくなる。
 */

/** 取り込んだ決定事項をぶら下げる見出し。既にあれば下に足す。 */
const DECISION_HEADING = '## 決まったこと';

export type DecisionNoteItem = {
  id: string;
  body: string;
  source: string;
  authorName: string;
  createdAt: Date;
};

/** まだ議事録へ入れていない決定事項。**新しい順ではなく古い順**（決まった順に読む）。 */
export async function listPendingDecisions(limit = 50): Promise<DecisionNoteItem[]> {
  return db
    .select({
      id: decisionNote.id,
      body: decisionNote.body,
      source: decisionNote.source,
      authorName: actor.name,
      createdAt: decisionNote.createdAt,
    })
    .from(decisionNote)
    .innerJoin(actor, eq(actor.id, decisionNote.authorId))
    .where(eq(decisionNote.isMerged, false))
    .orderBy(desc(decisionNote.createdAt))
    .limit(limit);
}

export async function countPendingDecisions(): Promise<number> {
  const rows = await db
    .select({ id: decisionNote.id })
    .from(decisionNote)
    .where(eq(decisionNote.isMerged, false));
  return rows.length;
}

/** 本文の末尾（または「決まったこと」の直後）に箇条書きで足す。 */
function appendDecisions(bodyMd: string, lines: string[]): string {
  const bullets = lines.map((line) => `- ${line.replace(/\r?\n+/g, ' ').trim()}`);
  const at = bodyMd.indexOf(DECISION_HEADING);

  if (at < 0) {
    const base = bodyMd.trimEnd();
    return `${base}${base ? '\n\n' : ''}${DECISION_HEADING}\n\n${bullets.join('\n')}\n`;
  }

  // 既にある見出しの塊の末尾に足す。次の見出しの手前で切る
  const after = at + DECISION_HEADING.length;
  const nextHeading = bodyMd.slice(after).search(/\n#{1,6} /);
  const cut = nextHeading < 0 ? bodyMd.length : after + nextHeading;

  const head = bodyMd.slice(0, cut).trimEnd();
  return `${head}\n${bullets.join('\n')}\n${bodyMd.slice(cut)}`;
}

/**
 * 決定事項を議事録へ取り込む（F-24 の後半）。
 *
 * **取り込みと既読化を同じトランザクションでやる。** 別々にすると、
 * 追記だけ通って未取り込みのまま残り、二重に入る。
 */
export async function mergeDecisions(
  actorCtx: ActorContext,
  documentId: string,
  noteIds: string[],
): Promise<{ merged: number }> {
  assertCan(actorCtx, 'document.edit');
  if (noteIds.length === 0) throw new ValidationError('取り込むものを選んでください');

  return db.transaction(async (tx) => {
    const [doc] = await tx
      .select({ id: document.id, type: document.type, bodyMd: document.bodyMd, isConfirmed: document.isConfirmed })
      .from(document)
      .where(eq(document.id, documentId))
      .limit(1);

    if (!doc) throw new NotFoundError('議事録が見つかりません', 'DOCUMENT_NOT_FOUND');
    if (doc.type !== 'minutes') throw new ValidationError('議事録にだけ取り込めます');
    if (doc.isConfirmed) {
      throw new ConflictError('確定済みの議事録には足せません', null, 'DOCUMENT_CONFIRMED');
    }

    const notes = await tx
      .select({ id: decisionNote.id, body: decisionNote.body })
      .from(decisionNote)
      .where(and(inArray(decisionNote.id, noteIds), eq(decisionNote.isMerged, false)))
      .orderBy(decisionNote.createdAt);

    if (notes.length === 0) {
      throw new ConflictError('すでに取り込み済みです', null, 'DECISION_ALREADY_MERGED');
    }

    await tx
      .update(document)
      .set({
        bodyMd: appendDecisions(doc.bodyMd, notes.map((n) => n.body)),
        updatedAt: new Date(),
      })
      .where(eq(document.id, documentId));

    await tx
      .update(decisionNote)
      .set({ isMerged: true, documentId })
      .where(inArray(decisionNote.id, notes.map((n) => n.id)));

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'document',
      entityId: documentId,
      action: 'update',
      diff: { mergedDecisions: notes.length },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    return { merged: notes.length };
  });
}

/** 取り込まずに捨てる。**消さずに既読にする**（誰が捨てたかは activity に残る）。 */
export async function dismissDecisions(
  actorCtx: ActorContext,
  noteIds: string[],
): Promise<{ dismissed: number }> {
  assertCan(actorCtx, 'document.edit');
  if (noteIds.length === 0) return { dismissed: 0 };

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(decisionNote)
      .set({ isMerged: true })
      .where(and(inArray(decisionNote.id, noteIds), eq(decisionNote.isMerged, false)))
      .returning({ id: decisionNote.id });

    if (updated.length > 0) {
      await recordActivity(tx, {
        actorId: actorCtx.id,
        entityType: 'document',
        entityId: updated[0]!.id,
        action: 'update',
        diff: { dismissedDecisions: updated.length },
        ip: actorCtx.ip,
        userAgent: actorCtx.userAgent,
      });
    }

    return { dismissed: updated.length };
  });
}

/* ------------------------------------------------------------------ *
 * F-25 議事録の行 → タスク
 * ------------------------------------------------------------------ */

export type MinutesLine = {
  /** 本文の何行目か（0始まり）。**行の中身ではなく位置で指す**――同じ文が複数あっても取り違えない */
  index: number;
  text: string;
  /** すでにこの行からタスクを作ってあるか */
  linkedTaskKey: string | null;
};

/** タスクにできそうな行を拾う。箇条書き・チェックボックス・見出し以外の1行。 */
export function candidateLines(bodyMd: string): MinutesLine[] {
  return bodyMd.split(/\r?\n/).flatMap((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('>') || line.startsWith('```')) return [];

    // 箇条書きの記号とチェックボックスを外す
    const text = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/^\[[ xX]\]\s*/, '')
      .trim();

    if (text.length < 2) return [];

    // 起票済みの印（行末の `[P1-3]`）が付いていれば、それを外した文を出す
    const marked = /\[([A-Z0-9]+-\d+)\]$/.exec(text);
    return [
      {
        index,
        text: marked ? text.slice(0, marked.index).trimEnd() : text,
        linkedTaskKey: marked?.[1] ?? null,
      },
    ];
  });
}

/**
 * 選んだ行からタスクを起こす（F-25）。
 *
 * **プロジェクトは議事録から引く。** 議事録は必ずプロジェクトの下にあるので、
 * ここで選ばせる必要がない（UI規約「利用者に決めさせないこと」）。
 *
 * **本文に印を戻す。** 作ったタスクのキーを行末に書き足して、二重に起票されないようにする。
 * 別テーブルで対応を持つと、本文を編集した瞬間にずれる。
 */
export async function tasksFromMinutes(
  actorCtx: ActorContext,
  documentId: string,
  lineIndexes: number[],
  options: { assigneeId?: string | null; dueDate?: string | null } = {},
): Promise<{ created: Array<{ key: string; title: string }> }> {
  assertCan(actorCtx, 'task.create');
  if (lineIndexes.length === 0) throw new ValidationError('タスクにする行を選んでください');

  const [doc] = await db
    .select({
      id: document.id,
      type: document.type,
      bodyMd: document.bodyMd,
      productId: document.productId,
    })
    .from(document)
    .where(eq(document.id, documentId))
    .limit(1);

  if (!doc) throw new NotFoundError('議事録が見つかりません', 'DOCUMENT_NOT_FOUND');
  if (!doc.productId) throw new ValidationError('プロジェクトに属さない資料からは起票できません');

  const lines = doc.bodyMd.split(/\r?\n/);
  const created: Array<{ key: string; title: string }> = [];

  /*
   * **1行ずつ順に作る。** タスクキーの採番はプロジェクト内の連番で、
   * 同時に走らせると同じ番号を取り合う。3人が同時に押す状況は無いので直列で足りる。
   */
  for (const index of lineIndexes) {
    const raw = lines[index];
    if (raw === undefined) continue;
    if (/\[[A-Z0-9]+-\d+\]\s*$/.test(raw.trim())) continue; // すでに起票済みの印がある

    const title = raw
      .trim()
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/^\[[ xX]\]\s*/, '')
      .trim()
      .slice(0, 200);

    if (title.length < 2) continue;

    const task = await createTask(actorCtx, {
      productId: doc.productId,
      featureId: null,
      parentTaskId: null,
      title,
      // どこから来たタスクかを本文に残す。議事録に戻れるようにする
      bodyMd: `議事録から起票：[${doc.type === 'minutes' ? '議事録' : '資料'}](/docs/${doc.id})`,
      status: 'todo',
      priority: 'normal',
      assigneeId: options.assigneeId ?? null,
      estimateMinutes: null,
      startDate: null,
      dueDate: options.dueDate ?? null,
    });

    lines[index] = `${raw.trimEnd()} [${task.key}]`;
    created.push({ key: task.key, title });
  }

  if (created.length === 0) {
    throw new ConflictError('起票できる行がありませんでした', null, 'NO_LINES');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(document)
      .set({ bodyMd: lines.join('\n'), updatedAt: new Date() })
      .where(eq(document.id, documentId));

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'document',
      entityId: documentId,
      action: 'update',
      diff: { tasksFromMinutes: created.map((c) => c.key) },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });
  });

  return { created };
}
