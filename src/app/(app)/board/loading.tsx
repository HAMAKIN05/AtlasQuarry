/**
 * かんばんのローディング。
 *
 * このセグメントには notFound() を呼ぶ画面がないため、ルート単位の loading.tsx を置いてよい。
 * （理由は src/components/Fallbacks.tsx のコメントを参照）
 */
export default function Loading() {
  return (
    <div className="page">
      <h1 className="page-title">かんばん</h1>
      <p className="loading" role="status" aria-live="polite">
        読み込み中…
      </p>
    </div>
  );
}
