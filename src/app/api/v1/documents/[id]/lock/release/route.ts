import { releaseLock } from '@/domain/document/service';
import { authed, ok } from '@/lib/api/handler';

/**
 * `navigator.sendBeacon` からの解除用。**POST しか送れない**ため、
 * DELETE とは別に口を用意する。タブを閉じられたときにロックを残さないのが目的。
 */
export const POST = authed<{ id: string }>(async ({ actor, meta, params }) => {
  await releaseLock({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, params.id);
  return ok({ locked: false });
});
