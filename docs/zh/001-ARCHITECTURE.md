# 架构

Pretend Act 按运行成本和集成边界拆分模块。根包保持轻量；GitHub workflow 执行、artifact storage 和 registry helper 都通过显式 subpath exports 暴露。

## 模块

- `pretend-act`：共享错误、类型、optional peer loader、process 和 filesystem helper。
- `pretend-act/github`：本地 GitHub workflow simulation 的常用 facade。
- `pretend-act/runner`：engine 无关的 workflow run 编排层。
- `pretend-act/engine`：`act` 与可选 `agent-ci` CLI backend 的 engine adapter。
- `pretend-act/actions`：action pretender 匹配、编译和内置 pretender factory。
- `pretend-act/workflows`：engine 无关的 workflow overlay model 和转换 helper。
- `pretend-act/github-core`：GitHub Actions environment primitives 与迁移 helper。
- `pretend-act/config`：用于配置文件和程序式 setup 的类型化配置 helper。
- `pretend-act/github-artifacts`：本地 artifact store 和 report helper。
- `pretend-act/github-registry`：event payload 与 GitHub context helper；面向 GitHub 调用方 re-export Git registry helper。
- `pretend-act/git-registry`：跨平台 Git registry、checkout snapshot 与可选 HTTP transport helper。
- `pretend-act/npm-registry`：npm registry 配置和 lifecycle helper。
- `pretend-act/crates-registry`：Cargo registry 配置和 lifecycle helper。
- `pretend-act/docker-registry`：本地 OCI Distribution registry lifecycle helper。

## Runner 模型

Runner 准备 GitHub Actions run，但不拥有 engine-specific 行为：它检查 engine capability，编译 action pretender，在 overlay 启用时 staging 派生 workflow，解析 sandbox working directory，然后把准备好的请求交给 engine adapter。源 workflow 文件不会被原地修改。结果对象保留 command metadata、exit code、stdout、stderr、combined raw log 和保守 status。只有在可靠时才填充 step 级细节。

Engine 相关细节位于明确的 engine 边界之后。每个 engine 会声明 capabilities，让 runner 能先给出 engine-aware 的失败错误。`act` adapter 构造 act command spec，并在受控 child process 中执行 binary。`agent-ci` adapter 会把 workflow-first request 映射到 `@redwoodjs/agent-ci` CLI，并且对当前 backend 还不能表达的字段快速失败，例如 event payload 注入或单 job 选择。公开配置优先描述 GitHub Actions 概念，再把 backend 选项放在 `engine.options` 下，因此后续 runner 不需要继承 `act` 的选项命名。

## Sandbox 模型

Sandbox 会把配置的 repository source 视为可通过多个本地 backend 暴露的输入。高层 `createGithubActionsContainer` API 接收带 owner、name、ref、sha 和 source 等 GitHub-like 字段的 `repository` 对象。Container 会将 repository source 复制到临时 repository，用于 workflow overlay 和 runner 可见文件，同时创建 checkout remote backend，用真实 Git fetch 支撑内置 `actions/checkout` pretender。它会按需在复制出的 repository 中初始化 git，并通过 `[Symbol.asyncDispose]` 负责 cleanup。只需要复制 workspace 的测试可以通过 `repository.checkout: false` 关闭 checkout backend。

## Git Registry 模型

`createGitRegistry` 会创建一个本地 Git registry，用来支撑 `actions/checkout` replacement step。这是默认 source simulation 层：workflow 从 Git remote fetch ref，而不是通过大范围 bind mount 直接看到调用方 workspace。脏工作区会先把选定 base commit materialize 到临时 snapshot worktree，再按共享 `.gitignore`/默认 ignore filter 同步调用方 workspace，写入新的 tree object，并把 snapshot commit 发布到 registry。显式 commit SHA、tag 和 clean branch ref 会直接发布选定 commit，避免用户刻意指定的 source 混入本地脏改。

Git object 操作由 `isomorphic-git` 实现；运行 Pretend Act 的宿主机不需要系统 `git` binary。默认 remote 是本地 `file:` URL；`transport: "http"` 会启动纯 Node HTTP transport，服务无法访问本地 filesystem registry URL 的 runner。bind mount 仍可作为 `act` 提供 runner workspace 的传输细节，但不是权威 checkout source。

## Workflow Overlay 模型

Overlay 是 engine 无关的 operation，只应用到 prepared workflow 文件。Step 可以按 id、name、`uses`、`run` 或 index 匹配。支持 replace、skip、insert before、insert after 和 keep。Action pretender 会先把 action-level rule 编译成这个 overlay model，再交给 engine adapter 执行。Pretender context 会包含当前 engine type 和 capabilities，让内置与自定义 pretender 可以按 backend 决定是否启用。

## Optional Peer 模型

根入口不需要的集成依赖都作为 optional peer。实现会在需要的 subpath 中动态加载；缺失时抛出带安装提示的 `PretendActOptionalPeerError`。

## 文件系统模型

默认执行路径使用 materialized 真实文件系统，因为 `act`、Git、npm、Cargo 和 Docker 都是外部进程。`@platformatic/vfs` 作为 optional backend 用于测试、overlay 和内部生成文件，但 Pretend Act 默认不会全局 mount 它。

## Registry 模型

Remote mock publishing 会把 workflow 指向本地服务，而不是降级 publish steps。npm 使用 Verdaccio。Docker 使用 Dockerode 管理官方 OCI Distribution `registry:3` runtime。Cargo server 实现 Cargo 需要的核心 sparse registry 与 Web API：publish、yank、unyank、owners、search、metadata、download 和 index files。GitHub API helper 隔离在 `github-registry` 模块，并动态加载 Octokit。

Remote mock pretender bundle 位于 `pretend-act/actions`。它会把保守的 npm/Cargo publish rewrite 编译成 workflow overlay operation，并携带调用方可传给 `PretendRunner` 或 `createGithubActionsContainer` 的 remote mock `env`、`secrets` 和 injection providers。Docker publishing 仍是 opt-in，因为 registry 可达性和 tag rewrite 在 host、`act`、Agent CI container 边界下差异较大。

[English](../en/001-ARCHITECTURE.md) | [中文](001-ARCHITECTURE.md)