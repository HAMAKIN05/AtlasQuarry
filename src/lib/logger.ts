/**
 * 構造化ログ（技術仕様書 §13）。JSON で標準出力へ出し、`docker logs` で拾う。
 *
 * **秘匿情報を出力しないこと**（CLAUDE.md 絶対ルール §4）。
 * 事故を仕組みで防ぐため、既知の危険なキーはこのモジュールが機械的に伏せる。
 * ただし伏せ字は最後の砦であり、そもそも渡さないのが原則。
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

function activeLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && configured in LEVEL_ORDER) return configured;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

/** 値を伏せるキー。部分一致で判定する。 */
const REDACT_PATTERNS = [
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'secret',
  'totp',
  'apikey',
  'key_hash',
  'keyhash',
  'authorization',
  'cookie',
  'webhook',
  'config_encrypted',
  'configencrypted',
  'encryption',
  'database_url',
  'databaseurl',
];

const REDACTED = '[REDACTED]';

function shouldRedact(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  return REDACT_PATTERNS.some((pattern) => normalized.includes(pattern.replace(/[-_]/g, '')));
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}B]`;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = shouldRedact(key) ? REDACTED : redact(val, depth + 1);
  }
  return out;
}

export type LogFields = Record<string, unknown>;

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVEL_ORDER[level] > LEVEL_ORDER[activeLevel()]) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(fields ? (redact(fields) as LogFields) : {}),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  debug: (message: string, fields?: LogFields) => emit('debug', message, fields),
};

/**
 * 例外をログに載せられる形にする。
 *
 * message と stack のみを取り出す。エラーオブジェクトに生の入力値がぶら下がっていることが
 * あるため、プロパティ全体を展開しない。
 */
export function describeError(error: unknown): {
  message: string;
  stack?: string;
  name?: string;
  cause?: unknown;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      // ドライバは元の例外を cause に入れる。これが無いと原因が分からない
      ...(error.cause ? { cause: describeError(error.cause) } : {}),
    };
  }
  return { message: String(error) };
}
