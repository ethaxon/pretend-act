# 路线图

Pretend Act 从 practical replacement 开始，服务本地 workflow simulation。首轮实现会明确记录延期边缘能力，而不是假装已经支持。

## 延后能力

- 超出本地 workflow simulation 的完整 GitHub REST API mock parity。
- 对所有 `actions/upload-artifact` 与 `actions/download-artifact` 版本的完整 artifact service protocol parity。
- 超出 `act` 已支持范围的 hosted service container 和 network topology emulation。
- 当 `act` 输出不足时的深度 matrix 和 job graph introspection。
- 如果迁移压力足够，在现代 facade 稳定后提供精确 legacy `act-js` API adapter。
- 完整迁移 SecurityDept `remote-mock`，从 workflow 中移除本地发布降级逻辑。
- 完整 Docker registry auth challenge 和 Bearer token parity。

## 废除的旧行为

- import 或 constructor 阶段写 `~/.actrc` 或任何用户 home 文件。
- 原地修改源 workflow 文件。
- 不做 snapshot/restore 的全局 `process.env` 修改。
- 把 `act` emoji/text output parser 当作唯一真相来源。
- 会影响无关测试或调用进程的隐藏网络拦截。

[English](../en/100-ROADMAP.md) | [中文](100-ROADMAP.md)