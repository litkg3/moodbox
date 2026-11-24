/**
 * 对话的数据结构。
 *
 * 只描述"界面上要显示的东西"，不含服务端细节：消息一旦落进本地存储，
 * 就只是一个 role + 一段文字，换一个模型、换一个供应商都不用迁移。
 */

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** 被用户按「停止生成」截断的消息，界面上标一句"已停止" */
  stopped?: boolean;
}

export interface CareResource {
  name: string;
  contact: string;
  note?: string;
}

/** 命中风险时服务端下发的固定关怀内容 */
export interface CarePayload {
  title: string;
  body: string;
  /** 是否显示"请先保证自己的安全"那一句 */
  urgent: boolean;
  resources: CareResource[];
}

/** SSE 事件。客户端只认这几种，其余一律忽略 */
export type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'care'; care: CarePayload }
  | { type: 'notice'; text: string }
  | { type: 'error'; message?: string };

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}
