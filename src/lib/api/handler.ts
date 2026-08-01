import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

import { AppError, InternalError, RateLimitError, UnauthorizedError, isAppError } from '@/lib/errors';
import { describeError, logger } from '@/lib/logger';
import { currentActor } from '@/lib/auth/cookies';
import type { SessionActor } from '@/lib/auth/session';

/**
 * API 層の共通処理（技術仕様書 §3）。
 *
 * - レスポンス形式を `{ data }` / `{ error }` に統一する
 * - AppError を HTTP ステータスへ一律に変換する
 * - リクエストごとに相関IDを発行してログに含める（§13）
 * - 500 の message に内部情報を含めない。詳細はサーバーログにのみ出す
 */

export type ApiMeta = { total: number; limit: number; offset: number };

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function okList<T>(data: T[], meta: ApiMeta): NextResponse {
  return NextResponse.json({ data, meta });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

function errorResponse(error: AppError, requestId: string): NextResponse {
  const headers: Record<string, string> = { 'X-Request-Id': requestId };
  if (error instanceof RateLimitError) {
    headers['Retry-After'] = String(error.retryAfterSeconds);
  }

  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    },
    { status: error.status, headers },
  );
}

/** リクエスト元の情報。activity と session の記録に使う。 */
export type RequestMeta = {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
};

export function requestMeta(request: NextRequest): RequestMeta {
  // ホスト側 Caddy が前段にいるため、素の remoteAddress ではなく転送ヘッダを見る。
  //
  // **最後の要素を取る。** Caddy は X-Forwarded-For を置き換えずに追記するため、先頭は
  // クライアントが自由に詰められる値になる。先頭を信じると、毎回でたらめなIPを名乗るだけで
  // ログイン試行のレート制限を素通りできてしまう。
  // 前段の信頼できるプロキシがちょうど1段という構成に依存した実装であり、
  // プロキシを多段にする場合はここを見直すこと。
  const forwarded = request.headers.get('x-forwarded-for');
  const chain = forwarded?.split(',').map((v) => v.trim()).filter((v) => v.length > 0) ?? [];
  const ip = chain.at(-1) ?? request.headers.get('x-real-ip') ?? null;

  return {
    ip: ip && ip.length > 0 ? ip : null,
    userAgent: request.headers.get('user-agent'),
    requestId: randomUUID(),
  };
}

type RouteContext<P> = { params: Promise<P> };

export type AuthedHandlerArgs<P> = {
  request: NextRequest;
  actor: SessionActor;
  params: P;
  meta: RequestMeta;
};

export type PublicHandlerArgs<P> = {
  request: NextRequest;
  params: P;
  meta: RequestMeta;
};

async function run(
  requestId: string,
  method: string,
  path: string,
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (isAppError(error)) {
      // 4xx は想定内。運用時のノイズにしないため warn 止まりにする
      logger.warn('APIエラー', {
        requestId,
        method,
        path,
        code: error.code,
        status: error.status,
      });
      return errorResponse(error, requestId);
    }

    logger.error('未処理の例外', {
      requestId,
      method,
      path,
      error: describeError(error),
    });
    return errorResponse(new InternalError(), requestId);
  }
}

/**
 * 認証必須のルートを包む。
 *
 * 認証チェックはここで一律に行うが、**権限判定（can）はハンドラ側の責務**。
 * ここで一緒にやると、アクションごとに異なる条件付き権限を表現できない。
 */
export function authed<P = Record<string, never>>(
  handler: (args: AuthedHandlerArgs<P>) => Promise<NextResponse>,
) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<NextResponse> => {
    const meta = requestMeta(request);
    const path = new URL(request.url).pathname;

    return run(meta.requestId, request.method, path, async () => {
      const actor = await currentActor();
      if (!actor) throw new UnauthorizedError();

      const params = context?.params ? await context.params : ({} as P);
      return handler({ request, actor, params, meta });
    });
  };
}

/** 認証不要のルート（ログインのみ）。 */
export function publicRoute<P = Record<string, never>>(
  handler: (args: PublicHandlerArgs<P>) => Promise<NextResponse>,
) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<NextResponse> => {
    const meta = requestMeta(request);
    const path = new URL(request.url).pathname;

    return run(meta.requestId, request.method, path, async () => {
      const params = context?.params ? await context.params : ({} as P);
      return handler({ request, params, meta });
    });
  };
}
