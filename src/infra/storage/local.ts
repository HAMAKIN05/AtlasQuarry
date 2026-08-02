import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * 添付ファイルの保存先（F-13）。
 *
 * **アダプタで抽象化する。** いまはVPSのローカルディスクに置くが、
 * 将来 S3 等へ移すときに、呼ぶ側を触らずに済むようにする。
 *
 * **保存名は利用者のファイル名から作らない。** 日本語・記号・同名の衝突・
 * パス移動（`../`）を全部気にすることになる。中身とは無関係の UUID で置き、
 * 表示名は DB（`attachment.filename`）に持つ。
 */

export type StorageAdapter = {
  save(bytes: Buffer, hint: { mimeType: string }): Promise<{ key: string }>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
};

function root(): string {
  return process.env.STORAGE_LOCAL_PATH ?? '/var/atlasquarry/attachments';
}

/** キーから実パスを作る。**キーは自分で発行したものしか受け付けない。** */
function pathOf(key: string): string {
  if (!/^[0-9a-f]{2}\/[0-9a-f-]{36}$/.test(key)) {
    throw new Error('保存キーの形式が不正です');
  }
  const full = resolve(join(root(), key));
  // 念のため、解決後も保存先の外へ出ていないことを確かめる
  if (!full.startsWith(resolve(root()))) throw new Error('保存先の外を指しています');
  return full;
}

export const localStorage: StorageAdapter = {
  async save(bytes) {
    const id = randomUUID();
    // 1つのディレクトリに数万件入れない。先頭2文字で分ける
    const shard = createHash('sha256').update(id).digest('hex').slice(0, 2);
    const key = `${shard}/${id}`;
    const full = pathOf(key);

    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes);
    return { key };
  },

  async read(key) {
    return readFile(pathOf(key));
  },

  async remove(key) {
    await rm(pathOf(key), { force: true });
  },
};
