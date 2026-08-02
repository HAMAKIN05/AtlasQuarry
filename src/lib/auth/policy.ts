/**
 * 認証まわりの定数のうち、**画面（クライアント）からも参照するもの。**
 *
 * `password.ts` は argon2（ネイティブ実装）を import しているので、
 * そこから定数を取ると **クライアントのバンドルに argon2 が引き込まれてビルドが落ちる**
 * （`Module not found: @node-rs/argon2-wasm32-wasi`。実際に落とした）。
 * 値だけを別ファイルに置いて、サーバー・クライアントの両方から安全に使えるようにする。
 */

export const PASSWORD_MIN_LENGTH = 12;
