#!/usr/bin/env node
/**
 * 同じ階層に別名の動的セグメントが無いかを見る。
 *
 * Next.js は `api/v1/tasks/[key]` と `api/v1/tasks/[idOrKey]` を**ビルドでは通す**が、
 * 起動した瞬間に `You cannot use different slug names for the same dynamic path` で
 * 全ページが 500 になる。実際にそれで本番を落とした（2026-08-03）。
 *
 * `npm run build` の前に走らせる。
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/app';
const problems = [];

function walk(dir) {
  const entries = readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory());
  const slugs = entries.filter((name) => name.startsWith('[') && name.endsWith(']'));

  if (slugs.length > 1) {
    problems.push(`${dir}: ${slugs.join(' と ')}`);
  }

  for (const name of entries) walk(join(dir, name));
}

walk(ROOT);

if (problems.length > 0) {
  console.error('同じ階層に別名の動的セグメントがあります。起動時に全ページが 500 になります:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log('動的セグメントの衝突はありません');
