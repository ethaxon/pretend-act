# 路线图

Pretend Act 从 practical replacement 开始，服务本地 workflow simulation。首轮实现会明确记录延期边缘能力，而不是假装已经支持。

## 主题决议

### Agent CI Engine 边界

`agent-ci` adapter 是 workflow-first engine，不是 `act` 兼容的 event runner。它应继续映射到 `agent-ci run --workflow` 或 `--all`，并拒绝当前 backend 无法表达的 request 字段，包括 event payload 注入、workflow dispatch inputs、单 job 选择、validation 和 dry-run。这样可以避免公开 API 默认继承 `act` 专属 command shape。

推荐后续工作：

- 保持 `runWorkflow()` 作为 workflow-first 的推荐入口，并在 docs/examples 中明确区分它和 event-first 的 `act` 执行。
- 继续跟踪 `@redwoodjs/agent-ci` 是否暴露稳定 library API。如果有，可以替换 CLI child-process executor，但保持 Pretend Act 的 engine 边界不变。

已实现 baseline：

- `act` 与 `agent-ci` 已有 engine capability metadata；当 request shape 不被支持时，`PretendRunner` 会在 staging 或启动 backend 前失败。
- `AgentCiEngine` 会先解析 optional peer 的 package bin，再回退到 `PATH`，并提供 Agent CI 专属 binary 错误；同时通过 `AGENT_CI_STATE_DIR` 读取 Agent CI run-result JSON，尽可能填充 `RunResult.jobs`。

悬而未决：

- 是否推动上游 Agent CI 支持 repository root 与 workflow file path 分离，例如 `--repo-root <path> --workflow <derived-file>`。
- Workflow dispatch inputs 对 Agent CI 应继续保持不支持，还是提供显式 opt-in helper。不能静默映射成 `vars`，因为这会改变 GitHub Actions 语义。

### 通用 Pretender 与派生 Workflow

Pretender 应保持 engine-independent，并输出 workflow overlay operation。它不应该 patch engine internal。只要 overlay 或 pretender 启用，runner 就应在执行前准备派生 workflow，源 workflow 文件保持不变，本地 simulation 差异也可以被审计。

派生 workflow 对第三方 remote simulation 很关键，因为 Agent CI 本身不提供 npm、crates、GHCR、Docker Hub 和其他外部 release API 的 mock。Agent CI 已覆盖很多 GitHub-side 行为，因此 checkout/cache/artifacts 这类 GitHub-native pretender 应按 engine capability gate，不应在 Agent CI 能直接建模时默认启用。

推荐后续工作：

- 在 Agent CI 支持 repository-root/workflow-path 分离前，派生 workflow 应放在 repository root 或 sandbox root 附近，避免 workflow 存在无关 temp directory 时导致 repo-root 推断错误。

已实现 baseline：

- `PretendRunner` 已使用 prepared workflow staging。无 transform 时返回原 workflow；overlay 或 pretender 产出 operation 时，会在 run `cwd` 下写入临时派生 workflow。
- Action pretender context 已包含 engine type 和 capabilities，pretender 可以按 backend opt in/out。
- Remote mock pretender MVP 可以通过 workflow overlay 将简单的 `npm publish`、`pnpm publish` 和 `cargo publish` run step 指向本地 registry。Docker publish rewrite 只通过显式 opt-in helper 提供。

悬而未决：

- 派生 workflow 是否应对所有 engine 都放在 disposable sandbox repository 中，还是允许某些 engine 使用调用方 working tree，只把 workflow file staging 到其他位置。
- SecurityDept 当前本地 publish downgrade 应有多少迁移进通用 remote pretender，又有多少保留为项目专属 action rule。
- 如何在 host execution、`act` container 和 Agent CI container 之间稳定暴露 Docker registry URL，而不引入过宽的 engine-specific 假设。

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