/**
 * ドメイン層のエラー階層（技術仕様書 §3.3）。
 *
 * ドメイン層は HTTP を知らない。ステータスコードへの変換は API 層（lib/api/handler.ts）で行う。
 * 500 の message に内部情報を含めないこと。詳細はサーバーログにのみ出力する。
 */

export type ErrorDetails = Record<string, unknown> | null;

export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  readonly details: ErrorDetails;

  constructor(message: string, details: ErrorDetails = null) {
    super(message);
    this.name = new.target.name;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  readonly code: string;
  readonly status = 400;

  constructor(message = '入力内容に誤りがあります', details: ErrorDetails = null, code = 'VALIDATION_ERROR') {
    super(message, details);
    this.code = code;
  }
}

export class UnauthorizedError extends AppError {
  readonly code = 'UNAUTHORIZED';
  readonly status = 401;

  constructor(message = 'ログインが必要です') {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly code = 'FORBIDDEN';
  readonly status = 403;

  constructor(message = 'この操作を行う権限がありません') {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly code: string;
  readonly status = 404;

  constructor(message = '対象が見つかりません', code = 'NOT_FOUND') {
    super(message);
    this.code = code;
  }
}

export class ConflictError extends AppError {
  readonly code: string;
  readonly status = 409;

  constructor(message = '他の操作と競合しました', details: ErrorDetails = null, code = 'CONFLICT') {
    super(message, details);
    this.code = code;
  }
}

export class RateLimitError extends AppError {
  readonly code = 'RATE_LIMITED';
  readonly status = 429;
  /** 再試行できるようになるまでの秒数。Retry-After ヘッダに使う。 */
  readonly retryAfterSeconds: number;

  constructor(message = '試行回数が上限に達しました', retryAfterSeconds = 900) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class InternalError extends AppError {
  readonly code = 'INTERNAL_ERROR';
  readonly status = 500;

  constructor(message = 'サーバー内部でエラーが発生しました') {
    super(message);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
