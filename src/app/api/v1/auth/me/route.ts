import { authed, ok } from '@/lib/api/handler';

/** GET /api/v1/auth/me。ログイン中の利用者情報。 */
export const GET = authed(async ({ actor }) => ok(actor));
