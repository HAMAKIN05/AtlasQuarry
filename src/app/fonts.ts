import { Inter } from 'next/font/google';

/**
 * 書体。**Notion と同じ構成に揃えている。**
 *
 * Notion の実際の指定を読んで確認したところ、こうなっている。
 *
 *   --font-family-primary-sans : NotionInter
 *   --font-family-fallback-sans: Inter, -apple-system, BlinkMacSystemFont,
 *                                "Segoe UI", Helvetica, Arial, sans-serif
 *
 * 重要なのは **NotionInter の @font-face が8面すべてラテンで、日本語グリフを持たない**こと。
 * つまり Notion は**日本語に何も指定しておらず、OS のフォントに任せている**
 * （Windows なら游ゴシック、Mac なら Hiragino）。ラテンだけ Inter で揃えている。
 *
 * 以前は日本語に Zen Kaku Gothic New を被せていたが、丸みのある独特な書体なので
 * 画面全体が癖のある見た目になっていた（「キモい」と言われた）。日本語への上書きをやめ、
 * ラテンを Inter にする。NotionInter は Inter のカスタム版なので、これで実質同じになる。
 *
 * 等幅は Notion が iA Writer Mono（商用フォント）なので同じにはできない。
 * Notion のフォールバック（Menlo, Courier, monospace）に合わせて OS の等幅に任せる。
 */
export const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans-loaded',
});
