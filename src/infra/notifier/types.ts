/**
 * 通知の送り先（F-09）。
 *
 * **アダプタで抽象化する。** ドメイン層は「誰に、何が起きたか」だけを渡し、
 * どの経路で届くか（アプリ内・メール・Discord）は知らない。
 * 経路を足すときに、発火側を1行も触らずに済むようにする。
 */

/** 起きたこと。**種類を増やすときは、必ず既定の宛先も決める。** */
export const NOTIFY_EVENTS = [
  'task.assigned',
  'task.due_soon',
  'task.overdue',
  'task.completed',
  'comment.created',
  'comment.mentioned',
  'request.created',
  'request.decided',
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export const NOTIFY_EVENT_LABELS: Record<NotifyEvent, string> = {
  'task.assigned': '自分にタスクが割り当てられた',
  'task.due_soon': '担当タスクの期限が近い',
  'task.overdue': '担当タスクが期限を過ぎた',
  'task.completed': '自分が作ったタスクが完了した',
  'comment.created': '関わっているタスクにコメントが付いた',
  'comment.mentioned': 'コメントで名前を呼ばれた',
  'request.created': '要望が出された',
  'request.decided': '自分が出した要望の判断がついた',
};

export type NotifyPayload = {
  event: NotifyEvent;
  /** 受け取る人 */
  actorId: string;
  title: string;
  body: string;
  /** アプリ内で開く先。`/tasks/PRD-12` のような相対パス */
  url?: string | null;
  targetType?: string | null;
  targetId?: string | null;
};

export type NotifierAdapter = {
  readonly channel: 'mail' | 'discord';
  /** 送れる状態か（設定が入っているか）。false ならキューに積まない */
  isConfigured(): Promise<boolean>;
  send(payload: NotifyPayload & { to: { name: string; email: string | null } }): Promise<void>;
};
