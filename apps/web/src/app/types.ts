/** 服务端接口返回的数据形状（与 apps/server/src 里的定义保持一致）。 */

export type Attention = 'active' | 'waiting' | 'incubating' | 'paused' | 'archived';
export const ATTENTION: readonly Attention[] = ['active', 'waiting', 'incubating', 'paused', 'archived'];

export interface Project {
  id: string;
  name: string;
  tracking: 'protocol' | 'manual';
  attention: Attention;
  freshnessDays: number;
  coreMilestones: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
