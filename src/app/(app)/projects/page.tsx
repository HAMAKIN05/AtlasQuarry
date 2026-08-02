import { redirect } from 'next/navigation';

/**
 * プロジェクト一覧は `/` に移した（アプリの入口をプロジェクトにしたため）。
 * 既に貼られたリンクや履歴が壊れないよう、ここは飛ばすだけにする。
 */
export default function ProjectsPage() {
  redirect('/');
}
