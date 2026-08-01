import type { PermissionSubject } from '@/lib/auth/rbac';

/**
 * ドメイン層のミューテーションに渡す「誰が・どこから」の情報。
 *
 * 権限判定に使う最小限（PermissionSubject）に、activity へ残す接続元情報を足したもの。
 * API 層で `{ ...actor, ip: meta.ip, userAgent: meta.userAgent }` の形で組み立てる。
 */
export type ActorContext = PermissionSubject & {
  name: string;
  ip?: string | null;
  userAgent?: string | null;
};
