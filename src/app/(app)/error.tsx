'use client';

import { useEffect } from 'react';

/**
 * 認証必須画面の共通エラー表示。
 *
 * **画面には内部情報を出さない**（技術仕様書 §3.3）。詳細はサーバーログ側にある。
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // digest 以外は出さない。error.message にはDBのクエリ等が入りうる
  }, []);

  return (
    <div className="page">
      <h1 className="page-title">エラーが発生しました</h1>
      <p>操作を完了できませんでした。時間をおいて再度お試しください。</p>
      <button type="button" onClick={reset}>
        再読み込み
      </button>
    </div>
  );
}
