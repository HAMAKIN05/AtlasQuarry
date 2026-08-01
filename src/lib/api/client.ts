/**
 * クライアントコンポーネントから /api/v1 を叩くための薄いラッパ。
 *
 * サーバー側のレスポンス形式（技術仕様書 §3.2）を1か所で解き、
 * エラーは日本語メッセージ付きの例外にして画面に出せるようにする。
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields: Record<string, string[]> | null;

  constructor(status: number, code: string, message: string, fields: Record<string, string[]> | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type ErrorBody = {
  error?: { code?: string; message?: string; details?: { fields?: Record<string, string[]> } | null };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const err = (body as ErrorBody).error;
    throw new ApiError(
      response.status,
      err?.code ?? 'UNKNOWN',
      err?.message ?? '通信に失敗しました',
      err?.details?.fields ?? null,
    );
  }

  return (body as { data: T }).data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
};
