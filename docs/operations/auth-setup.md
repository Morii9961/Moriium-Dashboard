# 本地设置与重置登录口令

这是 P6.2b 的离线操作工具。目前没有接入 HTTP 或登录界面，设置账户后不会启用认证、启动服务或改变业务数据库。正式账户操作与登录启用仍需 Morii 在对应步骤授权。

## 准备目录和终端

在仓库根目录使用项目指定的 Node / pnpm 版本。准备一个已经存在、由本人控制的私有绝对目录，放在仓库和同步盘之外；工具在其中固定打开 `auth.sqlite`。不要复制业务库并将其改名为认证库。

Linux 父目录不能允许组或其他用户写入，认证文件权限设为 `0600`；Windows 依赖父目录 ACL，不会替用户配置 ACL。该目录可以与业务数据目录相同，但认证库与 `dashboard.sqlite` 是独立文件。

必须使用交互终端，标准输入与标准输出都应为 TTY。口令由本人输入，不放进命令参数、环境变量、管道、聊天或操作记录。

## 创建唯一账户

下面的尖括号表示需要替换的参数，不是实际路径或账户：

```text
pnpm auth:setup init --data <EXISTING_ABSOLUTE_DIR> --account <login>
```

参数顺序固定。账户名为 1–64 个字符，以小写英文字母开头，后续仅允许小写英文字母、数字、点、下划线和连字符。该命令只能创建一个账户，已有账户会被拒绝覆盖。

依次输入两次相同的新口令，输入不回显。至少 15 个 Unicode 码位、至多 1024 个 UTF-8 字节，不能全是空白或含不完整 Unicode；不自动裁剪空格、规范化或截断。工具只在两次输入均完成、格式有效且一致后才打开认证库。

成功输出 `status: account_created`，同时标记 `sessionsRevoked: false`、`authActivated: false`、`serviceStarted: false`。输入取消或确认不一致时不会打开认证库；进入持久化阶段后遇到错误可能留下空认证文件或已初始化的空库，应先检查状态，不要直接删除目录重试。

## 本地重置口令

由有权访问私有目录的本机操作者执行：

```text
pnpm auth:setup reset --data <EXISTING_ABSOLUTE_DIR> --account <login> --confirm-reset
```

账户名必须与现有账户一致；同样需要两次隐藏输入。成功时在一个事务内更新口令哈希与凭据修订、撤销全部会话、清除登录限速，并记录固定事件。派生新哈希期间若凭据已被另一操作改变，本次重置会被拒绝，不覆盖新状态。

成功输出 `status: credentials_reset`、`sessionsRevoked: true`，`authActivated` 和 `serviceStarted` 仍为 `false`。这不是网站上的匿名重置入口，也不能代替将来的 HTTP 权限校验。

## 错误与保管

`--help` 可在非交互环境读取用法。错误退出码为 1，只输出固定错误码和用法，例如 `tty_required`、`cancelled`、`confirmation_mismatch`、`invalid_account`、`invalid_passphrase`、`account_exists`、`not_configured` 或 `credentials_changed`；不回显提交内容。

业务 ZIP 导出与恢复不包含认证哈希、会话或认证配置。认证资料的部署备份策略尚未完成；不要将 `auth.sqlite` 或它的 WAL / SHM 文件提交仓库、上传同步盘或当作普通项目快照导入。后续需要备份时，应先制定一致性备份和私有保管步骤。

实现取舍见 [ADR 0005](../adr/0005-private-auth-store.md)，验证范围见 [P6.2b 记录](../verification/p6-2b-auth-setup.md)。
