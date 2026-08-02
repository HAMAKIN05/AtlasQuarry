/**
 * 開発項目（feature）を「まとまり」（親タスク）へ移す一度きりの移行。
 *
 * 画面から開発項目という概念を無くしたので、既に入っているデータの行き先を作る。
 * **消さない。** feature の行はそのまま残し、タスクの所属だけを親子に移す。
 *
 *   1. feature ごとに、同じプロジェクトへ同名のタスクを1件作る（＝まとまり）
 *   2. その feature に属していたタスクの `parent_task_id` を、作ったタスクに向ける
 *   3. タスクの `feature_id` を null にする
 *
 * まとまり自身の期間は入れない。配下から導出する（`domain/task/grouping.ts`）。
 * キーの採番はタスク作成と同じ規則（`product.task_seq` を進める）。
 *
 * 冪等。既に同名のまとまりがあるプロジェクトでは作り直さない。
 *
 *   docker exec atlasquarry-app node scripts/features-to-groups.mjs
 */
import { Pool } from 'pg';

const POSITION_STEP = 1024;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL が設定されていません');

  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: features } = await client.query(
      `select f.id, f.name, f.product_id
         from feature f
        where exists (select 1 from task t where t.feature_id = f.id)
        order by f.product_id, f.position`,
    );

    if (features.length === 0) {
      console.log('移すものはありません');
      await client.query('COMMIT');
      return;
    }

    for (const feature of features) {
      // 既に同名のまとまりがあるなら作らない（冪等）
      const { rows: exist } = await client.query(
        `select id from task
          where product_id = $1 and title = $2 and parent_task_id is null
          limit 1`,
        [feature.product_id, feature.name],
      );

      let groupId = exist[0]?.id ?? null;

      if (!groupId) {
        const { rows: seqRows } = await client.query(
          `update product set task_seq = task_seq + 1 where id = $1 returning key, task_seq`,
          [feature.product_id],
        );
        const seq = seqRows[0];

        const { rows: posRows } = await client.query(
          `select coalesce(max(position), 0) as pos from task where product_id = $1`,
          [feature.product_id],
        );

        // 作った人は、その feature 配下の最初のタスクの作成者に合わせる
        const { rows: reporterRows } = await client.query(
          `select reporter_id from task where feature_id = $1 order by created_at limit 1`,
          [feature.id],
        );

        const { rows: created } = await client.query(
          `insert into task (product_id, key, title, status, priority, reporter_id, position)
           values ($1, $2, $3, 'todo', 'normal', $4, $5)
           returning id`,
          [
            feature.product_id,
            `${seq.key}-${seq.task_seq}`,
            feature.name,
            reporterRows[0].reporter_id,
            Number(posRows[0].pos) + POSITION_STEP,
          ],
        );
        groupId = created[0].id;
        console.log(`まとまりを作りました: ${feature.name}`);
      }

      const { rowCount } = await client.query(
        `update task set parent_task_id = $1, feature_id = null
          where feature_id = $2 and id <> $1`,
        [groupId, feature.id],
      );
      console.log(`  ${rowCount} 件を「${feature.name}」の中へ移しました`);
    }

    await client.query('COMMIT');
    console.log('移行が終わりました');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('移行に失敗しました:', error instanceof Error ? error.message : error);
  process.exit(1);
});
