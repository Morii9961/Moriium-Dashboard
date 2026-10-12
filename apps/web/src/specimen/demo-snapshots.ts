/**
 * 样张的演示快照：全部虚构（demo.* 项目），用来覆盖真实快照不一定有的情况：
 * 成熟待上线、已暂停、阶段未知、带进度估算。真实快照只在本机通过开发服务器读入，不进仓库。
 */
import type { RegisteredProject } from '@moriium-dashboard/protocol';

export const DEMO_REGISTRY: RegisteredProject[] = [
  { id: 'demo.harbor', name: '港湾（演示）' },
  { id: 'demo.loom', name: '织机（演示）' },
  { id: 'demo.lantern', name: '灯笼（演示）' },
  { id: 'demo.fog', name: '雾（演示）' },
];

const base = {
  schema_version: '1.1',
  source: {
    branch: 'codex/demo',
    commit_sha: 'a1b2c3d4e5f6a7b8c9d0',
    basis: ['docs/plan.md'],
    tests_rerun: false,
  },
  reporter: { agent: 'codex', note: '演示数据' },
};

const ms = (id: string, title: string, status: string, evidence = 'repository', acceptance = 'pending') => ({
  id,
  title,
  status,
  evidence_level: evidence,
  evidence_refs: evidence === 'repository' || evidence === 'existing_test' ? ['docs/demo.md'] : [],
  human_acceptance: acceptance,
});

export function demoSnapshots(now: Date): { fileName: string; json: string }[] {
  const at = (hoursAgo: number) => {
    const d = new Date(now.getTime() - hoursAgo * 3_600_000);
    return `${d.toISOString().slice(0, 19)}Z`;
  };
  const list = [
    {
      ...base,
      project_id: 'demo.harbor',
      project_name: '港湾（演示）',
      snapshot_at: at(30),
      stage: 'launch_preparation',
      summary: '演示：功能都已完成并有测试记录，只剩部署和上线前的检查。',
      overall_progress: null,
      milestones: [
        ms('core', '核心功能', 'done', 'existing_test', 'accepted'),
        ms('i18n', '三语界面', 'done', 'existing_test'),
        ms('search', '静态搜索', 'done', 'repository'),
        ms('design', '视觉定稿', 'done', 'morii_accepted', 'accepted'),
        ms('deploy-plan', '部署方案', 'done', 'self_report'),
      ],
      blockers: [],
      next_actions: [{ id: 'deploy', title: '确定托管和域名', priority: 'P0', result: '可以开始部署' }],
      needs_morii: [{ id: 'domain', decision: '用哪个域名上线？' }],
    },
    {
      ...base,
      project_id: 'demo.loom',
      project_name: '织机（演示）',
      snapshot_at: at(4),
      stage: 'integration',
      summary: '演示：桌面端和本地存储已接上，真实模型尚未验收，有一个里程碑受阻。',
      overall_progress: 60,
      milestones: [
        ms('desktop', '桌面端', 'done', 'existing_test'),
        ms('storage', '本地存储', 'done', 'existing_test'),
        ms('sync', '会话接续', 'done', 'repository'),
        ms('model', '真实模型调用', 'in_progress', 'existing_test'),
        ms('tools', '工具执行', 'unknown', 'unknown', 'unknown'),
        ms('win', 'Windows 验收', 'in_progress', 'existing_test'),
        ms('sign', '安装包签名', 'blocked', 'repository', 'not_required'),
        ms('cloud', '云端同步', 'not_started', 'self_report'),
        ms('daily', '日常可用', 'not_started', 'self_report'),
      ],
      blockers: [{ id: 'cert', title: '签名证书未申请', impact: 'Windows 会提示未知发布者' }],
      next_actions: [{ id: 'model', title: '完成真实模型验收', priority: 'P0', result: '端到端证据' }],
      needs_morii: [
        { id: 'scope', decision: '日常可用的验收清单包括哪些？' },
        { id: 'cert', decision: '要不要现在申请签名？' },
      ],
    },
    {
      ...base,
      project_id: 'demo.lantern',
      project_name: '灯笼（演示）',
      snapshot_at: at(24 * 20),
      stage: 'paused',
      summary: '演示：主动暂停，等课程结束后继续。',
      overall_progress: null,
      milestones: [
        ms('proto', '原型', 'done', 'self_report'),
        ms('content', '内容整理', 'in_progress', 'self_report'),
      ],
      blockers: [],
      next_actions: [{ id: 'resume', title: '课程结束后恢复', priority: 'P2', result: '继续整理内容' }],
      needs_morii: [],
    },
    {
      ...base,
      project_id: 'demo.fog',
      project_name: '雾（演示）',
      snapshot_at: at(24 * 16),
      stage: 'unknown',
      summary: '演示：Agent 无法判断当前阶段，仓库里缺少最近的记录。',
      overall_progress: null,
      milestones: [
        ms('a', '第一部分', 'unknown', 'unknown', 'unknown'),
        ms('b', '第二部分', 'done', 'self_report'),
      ],
      blockers: [],
      next_actions: [],
      needs_morii: [{ id: 'status', decision: '这个项目还在进行吗？' }],
    },
  ];
  return list.map((s) => ({ fileName: `${s.project_id}.json`, json: JSON.stringify(s, null, 2) }));
}
