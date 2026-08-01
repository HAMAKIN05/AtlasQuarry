/**
 * ローディング表示（受入基準 5.8「ローディング・エラー・空状態が全画面に実装されている」）。
 *
 * ルート単位の `loading.tsx` ではなくページ内の `<Suspense>` で出している。
 * `loading.tsx` を置くとページ本体より先にシェルがストリーミングされ、その後で `notFound()` を
 * 呼んでも HTTP ステータスが 200 のまま返ってしまうため。
 * 対象が見つからないときに 404 を返す画面（タスク詳細・プロダクト詳細）で実際に踏んだ。
 */

export function PanelFallback({ label }: { label: string }) {
  return (
    <section className="panel">
      <h2 className="panel-title">{label}</h2>
      <p className="loading" role="status" aria-live="polite">
        読み込み中…
      </p>
    </section>
  );
}

export function BlockFallback() {
  return (
    <p className="loading" role="status" aria-live="polite">
      読み込み中…
    </p>
  );
}
