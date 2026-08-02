'use client';

import { useEffect, useState } from 'react';

/**
 * 実機のビューポートの実測値を画面に出すだけの診断ページ。**確認が済んだら消す。**
 *
 * iPhone 実機で右端が切れるのに、Windows Chrome では 200〜430px のどの幅でも
 * 再現しなかった。推測で直すのを3回繰り返さないために、実機に値を言わせる。
 *
 * 見るところ:
 *   - `layoutWidth` > `visualWidth` なら、Safari が shrink-to-fit で
 *     レイアウトを広げている（＝どこかに縮まない要素がある）
 *   - `scale` が 1 でなければ、ページズームが効いている
 *   - 「版」が出ていなければ、そもそも新しい版を見ていない（キャッシュ）
 */
/** キャッシュを見ていないかの目印。デプロイのたびに手で上げる。 */
const BUILD_MARK = '診断v1（2026-08-02 午前）';

type Row = { label: string; value: string; warn?: boolean };

export default function ViewportProbe() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    function read(): Row[] {
      const de = document.documentElement;
      const vv = window.visualViewport;
      const layout = de.clientWidth;
      const visual = vv ? Math.round(vv.width) : layout;
      const meta = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? 'なし';
      const probe = document.createElement('div');
      probe.style.paddingBottom = 'env(safe-area-inset-bottom)';
      document.body.appendChild(probe);
      const inset = getComputedStyle(probe).paddingBottom;
      probe.remove();

      return [
        { label: '版', value: BUILD_MARK },
        {
          label: 'レイアウト幅 (clientWidth)',
          value: `${layout}px`,
          warn: layout > visual + 1,
        },
        { label: '表示幅 (visualViewport)', value: `${visual}px`, warn: layout > visual + 1 },
        { label: 'ズーム倍率 (scale)', value: String(vv ? vv.scale : '不明'), warn: !!vv && vv.scale !== 1 },
        { label: 'window.innerWidth', value: `${window.innerWidth}px` },
        { label: 'screen.width', value: `${window.screen.width}px` },
        { label: 'devicePixelRatio', value: String(window.devicePixelRatio) },
        {
          label: 'ページの中身の幅 (scrollWidth)',
          value: `${de.scrollWidth}px`,
          warn: de.scrollWidth > layout + 1,
        },
        { label: 'html の overflow-x', value: getComputedStyle(de).overflowX },
        { label: 'body の overflow-x', value: getComputedStyle(document.body).overflowX },
        { label: 'safe-area-inset-bottom', value: inset, warn: inset === '0px' },
        { label: 'viewport meta', value: meta },
      ];
    }

    setRows(read());
    const onResize = () => setRows(read());
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 14, lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>ビューポート診断</h1>
      <p style={{ marginBottom: 12, fontSize: 13 }}>
        この画面を撮って送ってください。赤い行があれば、そこが原因です。
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} style={{ color: row.warn ? '#c62828' : undefined }}>
              <td style={{ padding: '4px 8px 4px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {row.label}
              </td>
              <td style={{ padding: '4px 0', fontWeight: 700, wordBreak: 'break-all' }}>
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 幅の基準線。画面の端まで届いていなければ、レイアウトが広がっている */}
      <div style={{ marginTop: 20, fontSize: 12 }}>
        下の帯が画面の右端まで届いていれば正常。切れていたらレイアウトが広がっている。
      </div>
      <div style={{ marginTop: 6, height: 24, background: 'repeating-linear-gradient(90deg,#1976d2 0 20px,#90caf9 20px 40px)' }} />
    </div>
  );
}
