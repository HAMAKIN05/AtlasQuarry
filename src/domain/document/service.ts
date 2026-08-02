import { and, asc, desc, eq } from 'drizzle-orm';

import { db, type Transaction } from '@/db/client';
import { actor, document, documentRevision } from '@/db/schema';
import type { DocumentType } from '@/db/schema/enums';
import { recordActivity } from '@/domain/activity/recorder';
import type { ActorContext } from '@/domain/actor-context';
import { assertCan } from '@/lib/auth/rbac';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { POSITION_STEP } from '@/lib/position';

/**
 * ドキュメントと議事録（F-11 / F-23）。
 *
 * **`type` 違いの同じもの**として扱う。仕様書・ナレッジ・議事録で別の画面を作ると、
 * 「これはどこに書くのか」を毎回考えさせることになる。違うのは
 * 議事録だけが持つ2つの欄（開催日・確定）だけ。
 *
 * **階層は1段まで。** スマホで深いツリーは畳んでも辿れない。
 * 「フォルダ（親）とその中の文書」で足りる。
 *
 * **リアルタイム共同編集はしない**（技術仕様書 §9）。排他ロックで、
 * 誰かが編集中なら他の人は読めるが書けない。
 */

/** ロックが自動で切れるまで。**取ったまま帰った人**のために要る。 */
const LOCK_MINUTES = 30;

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  spec: '仕様',
  knowledge: '覚え書き',
  minutes: '議事録',
};

export type DocumentListItem = {
  id: string;
  parentId: string | null;
  type: DocumentType;
  title: string;
  meetingDate: string | null;
  isConfirmed: boolean;
  updatedAt: Date;
  createdByName: string;
};

export type DocumentDetail = DocumentListItem & {
  productId: string | null;
  bodyMd: string;
  lockedBy: string | null;
  lockedByName: string | null;
  lockedAt: Date | null;
};

const LIST_COLUMNS = {
  id: document.id,
  parentId: document.parentId,
  type: document.type,
  title: document.title,
  meetingDate: document.meetingDate,
  isConfirmed: document.isConfirmed,
  updatedAt: document.updatedAt,
  createdByName: actor.name,
};

export async function listDocuments(productId: string): Promise<DocumentListItem[]> {
  return db
    .select(LIST_COLUMNS)
    .from(document)
    .innerJoin(actor, eq(actor.id, document.createdBy))
    .where(eq(document.productId, productId))
    .orderBy(asc(document.position));
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  const rows = await db
    .select({
      ...LIST_COLUMNS,
      productId: document.productId,
      bodyMd: document.bodyMd,
      lockedBy: document.lockedBy,
      lockedAt: document.lockedAt,
    })
    .from(document)
    .innerJoin(actor, eq(actor.id, document.createdBy))
    .where(eq(document.id, id))
    .limit(1);

  const found = rows[0];
  if (!found) throw new NotFoundError('ドキュメントが見つかりません', 'DOCUMENT_NOT_FOUND');

  let lockedByName: string | null = null;
  if (found.lockedBy && !isLockExpired(found.lockedAt)) {
    const [holder] = await db
      .select({ name: actor.name })
      .from(actor)
      .where(eq(actor.id, found.lockedBy))
      .limit(1);
    lockedByName = holder?.name ?? null;
  }

  return {
    ...found,
    lockedBy: lockedByName ? found.lockedBy : null,
    lockedByName,
  };
}

function isLockExpired(lockedAt: Date | null): boolean {
  if (!lockedAt) return true;
  return Date.now() - lockedAt.getTime() > LOCK_MINUTES * 60 * 1000;
}

export type CreateDocumentInput = {
  productId: string;
  parentId: string | null;
  type: DocumentType;
  title: string;
  meetingDate?: string | null;
  /** 作った時点で中身がある場合（MCP からのドラフト投入。F-26）。 */
  bodyMd?: string;
};

export async function createDocument(actorCtx: ActorContext, input: CreateDocumentInput) {
  assertCan(actorCtx, 'document.create');

  if (input.title.trim().length === 0) {
    throw new ValidationError('題名を入力してください');
  }

  return db.transaction(async (tx) => {
    // **階層は1段まで。** 親に親がいるなら、その親の下へ回す
    let parentId = input.parentId;
    if (parentId) {
      const [parent] = await tx
        .select({ id: document.id, parentId: document.parentId })
        .from(document)
        .where(eq(document.id, parentId))
        .limit(1);
      if (!parent) throw new NotFoundError('親が見つかりません', 'DOCUMENT_NOT_FOUND');
      parentId = parent.parentId ?? parent.id;
    }

    const [last] = await tx
      .select({ position: document.position })
      .from(document)
      .where(eq(document.productId, input.productId))
      .orderBy(desc(document.position))
      .limit(1);

    const [created] = await tx
      .insert(document)
      .values({
        productId: input.productId,
        parentId,
        type: input.type,
        title: input.title.trim(),
        ...(input.bodyMd ? { bodyMd: input.bodyMd } : {}),
        // 議事録以外に開催日を持たせない（DB の CHECK と同じ条件を入口でも弾く）
        meetingDate: input.type === 'minutes' ? (input.meetingDate ?? null) : null,
        position: last ? last.position + POSITION_STEP : POSITION_STEP,
        createdBy: actorCtx.id,
      })
      .returning();

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'document',
      entityId: created!.id,
      action: 'create',
      diff: { title: created!.title, type: created!.type },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    return created!;
  });
}

/**
 * 編集を始める（ロックを取る）。
 *
 * **取れなかったら誰が持っているかを返す。** 3人なので、声を掛ければ済む。
 * `LOCK_MINUTES` 経過したロックは自動で切れる（取ったまま帰った人のため）。
 */
export async function acquireLock(actorCtx: ActorContext, id: string): Promise<void> {
  assertCan(actorCtx, 'document.edit');

  await db.transaction(async (tx) => {
    const [found] = await tx
      .select({ lockedBy: document.lockedBy, lockedAt: document.lockedAt })
      .from(document)
      .where(eq(document.id, id))
      .limit(1);
    if (!found) throw new NotFoundError('ドキュメントが見つかりません', 'DOCUMENT_NOT_FOUND');

    if (found.lockedBy && found.lockedBy !== actorCtx.id && !isLockExpired(found.lockedAt)) {
      const [holder] = await tx
        .select({ name: actor.name })
        .from(actor)
        .where(eq(actor.id, found.lockedBy))
        .limit(1);
      throw new ConflictError(
        `${holder?.name ?? '別の人'}さんが編集しています`,
        null,
        'DOCUMENT_LOCKED',
      );
    }

    await tx
      .update(document)
      .set({ lockedBy: actorCtx.id, lockedAt: new Date() })
      .where(eq(document.id, id));
  });
}

export async function releaseLock(actorCtx: ActorContext, id: string): Promise<void> {
  await db
    .update(document)
    .set({ lockedBy: null, lockedAt: null })
    .where(and(eq(document.id, id), eq(document.lockedBy, actorCtx.id)));
}

/**
 * 保存する。
 *
 * **版は保存のたびには作らない。** 押すたびに履歴が積まれると、
 * 「どこが本当の区切りか」が分からなくなる。
 * 直前の版から**10分以上経っているか、書いた人が変わったとき**だけ新しい版にする。
 * それ以外は直前の版を上書きする（＝打ち直しは1版にまとまる）。
 */
const REVISION_GAP_MINUTES = 10;

export async function saveDocument(
  actorCtx: ActorContext,
  id: string,
  input: { title?: string; bodyMd?: string; meetingDate?: string | null },
) {
  assertCan(actorCtx, 'document.edit');

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(document).where(eq(document.id, id)).limit(1);
    if (!before) throw new NotFoundError('ドキュメントが見つかりません', 'DOCUMENT_NOT_FOUND');

    if (before.lockedBy && before.lockedBy !== actorCtx.id && !isLockExpired(before.lockedAt)) {
      throw new ConflictError('ほかの人が編集しています', null, 'DOCUMENT_LOCKED');
    }

    /*
     * **確定した議事録は書き換えさせない。** 確定は「この内容で決まった」という宣言なので、
     * あとから中身が変わると、決まったことの記録として使えなくなる。
     * 直したいときは、権限のある人が確定を外してから直す。
     */
    if (before.isConfirmed && (input.bodyMd !== undefined || input.title !== undefined)) {
      throw new ConflictError(
        '確定済みの議事録は編集できません。直すには先に確定を外してください',
        null,
        'MINUTES_CONFIRMED',
      );
    }

    const bodyMd = input.bodyMd ?? before.bodyMd;

    if (bodyMd !== before.bodyMd) {
      await writeRevision(tx, id, before.bodyMd, actorCtx.id);
    }

    const [updated] = await tx
      .update(document)
      .set({
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.bodyMd !== undefined ? { bodyMd } : {}),
        ...(input.meetingDate !== undefined && before.type === 'minutes'
          ? { meetingDate: input.meetingDate }
          : {}),
        updatedAt: new Date(),
        lockedBy: actorCtx.id,
        lockedAt: new Date(),
      })
      .where(eq(document.id, id))
      .returning();

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'document',
      entityId: id,
      action: 'update',
      diff: { title: updated!.title },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    return updated!;
  });
}

/** 直前の版を見て、続きなら上書き、区切りなら新しい版を作る。 */
async function writeRevision(tx: Transaction, documentId: string, bodyMd: string, authorId: string) {
  const [last] = await tx
    .select({
      id: documentRevision.id,
      authorId: documentRevision.authorId,
      createdAt: documentRevision.createdAt,
    })
    .from(documentRevision)
    .where(eq(documentRevision.documentId, documentId))
    .orderBy(desc(documentRevision.createdAt))
    .limit(1);

  const continuation =
    last &&
    last.authorId === authorId &&
    Date.now() - last.createdAt.getTime() < REVISION_GAP_MINUTES * 60 * 1000;

  if (continuation) {
    await tx
      .update(documentRevision)
      .set({ bodyMd, createdAt: new Date() })
      .where(eq(documentRevision.id, last.id));
    return;
  }

  await tx.insert(documentRevision).values({ documentId, bodyMd, authorId });
}

export type RevisionItem = {
  id: string;
  authorName: string;
  createdAt: Date;
  bodyMd: string;
};

export async function listRevisions(documentId: string, limit = 30): Promise<RevisionItem[]> {
  return db
    .select({
      id: documentRevision.id,
      authorName: actor.name,
      createdAt: documentRevision.createdAt,
      bodyMd: documentRevision.bodyMd,
    })
    .from(documentRevision)
    .innerJoin(actor, eq(actor.id, documentRevision.authorId))
    .where(eq(documentRevision.documentId, documentId))
    .orderBy(desc(documentRevision.createdAt))
    .limit(limit);
}

/**
 * 議事録を確定する（F-23）。
 *
 * **確定＝「この内容で決まった、として扱う」という宣言。**
 * 確定後も編集はできる（間違いは直せる）が、確定を外すと履歴に残る。
 * 決定事項（`decision_note`）をタスクにできるのは確定後だけ、という運用の起点になる。
 */
export async function confirmMinutes(actorCtx: ActorContext, id: string, confirmed: boolean) {
  assertCan(actorCtx, 'minutes.confirm');

  return db.transaction(async (tx) => {
    const [found] = await tx.select().from(document).where(eq(document.id, id)).limit(1);
    if (!found) throw new NotFoundError('ドキュメントが見つかりません', 'DOCUMENT_NOT_FOUND');
    if (found.type !== 'minutes') {
      throw new ValidationError('議事録だけが確定できます');
    }

    const [updated] = await tx
      .update(document)
      .set({ isConfirmed: confirmed, updatedAt: new Date() })
      .where(eq(document.id, id))
      .returning();

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'document',
      entityId: id,
      action: 'update',
      diff: { confirmed },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    return updated!;
  });
}

export async function deleteDocument(actorCtx: ActorContext, id: string): Promise<void> {
  assertCan(actorCtx, 'document.edit');

  await db.transaction(async (tx) => {
    const [found] = await tx.select().from(document).where(eq(document.id, id)).limit(1);
    if (!found) throw new NotFoundError('ドキュメントが見つかりません', 'DOCUMENT_NOT_FOUND');

    // 子がいるなら消させない。まとめて消えると気づけない
    const [child] = await tx
      .select({ id: document.id })
      .from(document)
      .where(eq(document.parentId, id))
      .limit(1);
    if (child) {
      throw new ConflictError('中に入っているものを先に移すか消してください', null, 'HAS_CHILDREN');
    }

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'document',
      entityId: id,
      action: 'delete',
      diff: { title: found.title },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    await tx.delete(document).where(eq(document.id, id));
  });
}


/**
 * 過去の版に戻す。
 *
 * **戻す前の本文も履歴に残す。** 戻した操作自体を取り消せないと、
 * 「戻したら消えた」が起きる。
 */
export async function restoreRevision(
  actorCtx: ActorContext,
  documentId: string,
  revisionId: string,
) {
  assertCan(actorCtx, 'document.edit');

  return db.transaction(async (tx) => {
    const [doc] = await tx.select().from(document).where(eq(document.id, documentId)).limit(1);
    if (!doc) throw new NotFoundError('ドキュメントが見つかりません', 'DOCUMENT_NOT_FOUND');
    if (doc.isConfirmed) {
      throw new ConflictError('確定済みの議事録は戻せません', null, 'MINUTES_CONFIRMED');
    }

    const [rev] = await tx
      .select({ bodyMd: documentRevision.bodyMd })
      .from(documentRevision)
      .where(and(eq(documentRevision.id, revisionId), eq(documentRevision.documentId, documentId)))
      .limit(1);
    if (!rev) throw new NotFoundError('その版が見つかりません', 'REVISION_NOT_FOUND');

    // 戻す前を必ず1版として残す
    await tx.insert(documentRevision).values({
      documentId,
      bodyMd: doc.bodyMd,
      authorId: actorCtx.id,
    });

    const [updated] = await tx
      .update(document)
      .set({ bodyMd: rev.bodyMd, updatedAt: new Date() })
      .where(eq(document.id, documentId))
      .returning();

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'document',
      entityId: documentId,
      action: 'update',
      diff: { restoredFrom: revisionId },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    return updated!;
  });
}
