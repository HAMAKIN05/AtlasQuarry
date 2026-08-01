import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="page-title">見つかりません</h1>
      <p>指定された対象は存在しないか、削除された可能性があります。</p>
      <p>
        <Link href="/">ダッシュボードへ戻る</Link>
      </p>
    </div>
  );
}
