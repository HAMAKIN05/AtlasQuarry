import type { Metadata, Viewport } from 'next';

import { sans } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'AtlasQuarry',
  description: '法人内システム内製化プロジェクトのためのプロジェクト管理ツール',
};

/**
 * モバイルファースト（CLAUDE.md UI規約）。
 * ズームを禁止しないのは、拡大できないと読めない利用者を締め出すため。
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
