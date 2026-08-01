import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

/**
 * Markdown のレンダリング（機能定義書 §7 エディタ方針）。
 *
 * リッチテキストは採用せず、内部表現は常に Markdown。
 * **rehype-sanitize を外さないこと。** 本文は利用者が自由に書ける入力であり、
 * 素通しすると保存された XSS になる。
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  // allowDangerousHtml は付けない。生 HTML はそのままエスケープされる
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeStringify);

export async function renderMarkdown(source: string): Promise<string> {
  const file = await processor.process(source);
  return String(file);
}
