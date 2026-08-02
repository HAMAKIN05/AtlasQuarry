import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { notificationPref } from '@/db/schema';
import { NOTIFY_CHANNELS } from '@/db/schema/enums';
import { NOTIFY_EVENTS } from '@/infra/notifier/types';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson } from '@/lib/validation';

/**
 * お知らせの受け取り設定（F-09）。**自分のぶんだけ変えられる。**
 *
 * 行が無いときは既定に従う（`domain/notification/service.ts`）。
 * **触った出来事は全経路ぶん書く。** 途中まで書くと、既定に戻ったのか
 * 切ったのかが区別できなくなる。
 */
const bodySchema = z.object({
  event: z.enum(NOTIFY_EVENTS),
  channels: z.array(z.enum(NOTIFY_CHANNELS)),
});

export const PATCH = authed(async ({ request, actor }) => {
  const input = parseOrThrow(bodySchema, await readJson(request));

  await db.transaction(async (tx) => {
    await tx
      .delete(notificationPref)
      .where(
        and(eq(notificationPref.actorId, actor.id), eq(notificationPref.eventType, input.event)),
      );

    for (const channel of NOTIFY_CHANNELS) {
      await tx.insert(notificationPref).values({
        actorId: actor.id,
        eventType: input.event,
        channel,
        enabled: input.channels.includes(channel),
      });
    }
  });

  return ok({ event: input.event, channels: input.channels });
});
