# 架构决定（ADR）

每份一个决定，写清背景、决定、理由和后果。推翻旧决定时新增一份，并在旧的里写「已被 NNNN 替代」。

| 编号 | 决定 | 状态 |
| --- | --- | --- |
| [0001](./0001-toolchain-and-native-typescript.md) | 工具链版本；Node 直接运行 TypeScript，不加构建步骤 | 采用 |
| [0002](./0002-protocol-package.md) | 协议包：预编译校验器、接收流水线、问题条目与文案分离 | 采用 |
| [0003](./0003-server-storage-and-local-security.md) | 服务端：node:sqlite、迁移、备份、数据目录、本机安全 | 采用 |
| [0004](./0004-work-cover-storage.md) | 成果封面：本机重编码、受限 WebP、SQLite BLOB 与完整导出 | 采用 |
| [0006](./0006-usage-ledger.md) | 独立 Usage 协议、范围替代、人工冲突审核、固定精度 API 等价值与不可变账单 | 业务规则已确认 |
| [0007](./0007-usage-quality-and-unallocated-time.md) | Usage 1.1 有限质量原因、无法归日观测与旧账单计算器兼容 | 协议冻结；消费者验证待补 |
