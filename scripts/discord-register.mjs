#!/usr/bin/env node
/**
 * Discord にスラッシュコマンドを登録する（F-22c / F-24）。一度だけ実行する。
 *
 *   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... node scripts/discord-register.mjs
 *
 * **アプリ全体に登録する**（ギルド限定にしない）。3人の1サーバーで使うので、
 * サーバーIDを設定に持たせるほうが手間になる。反映に最大1時間かかる。
 */

const appId = process.env.DISCORD_APP_ID;
const token = process.env.DISCORD_BOT_TOKEN;

if (!appId || !token) {
  console.error('DISCORD_APP_ID と DISCORD_BOT_TOKEN を渡してください');
  process.exit(1);
}

const commands = [
  {
    name: '要望',
    description: 'AtlasQuarry に要望を出す',
    options: [
      { name: 'title', description: '要望の内容', type: 3, required: true },
    ],
  },
  {
    name: '決定',
    description: '決まったことを控える（議事録には人が確認してから入ります）',
    options: [{ name: 'text', description: '決まったこと', type: 3, required: true }],
  },
];

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: 'PUT',
  headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify(commands),
});

if (!res.ok) {
  // **トークンは出さない**
  console.error(`登録に失敗しました: ${res.status}`);
  process.exit(1);
}

console.log(`登録しました: ${commands.map((c) => `/${c.name}`).join(' ')}`);
