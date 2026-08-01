/** 設定画面のローディング。このセグメントには notFound() を呼ぶ画面がない。 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <p className="loading" role="status" aria-live="polite">
        読み込み中…
      </p>
    </div>
  );
}
