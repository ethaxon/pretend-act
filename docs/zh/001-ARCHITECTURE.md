# 架构

Pretend Act 按运行成本和集成边界拆分模块。根包保持轻量；GitHub workflow 执行、artifact storage 和 registry helper 都通过显式 subpath exports 暴露。

## 模块

- `pretend-act`：共享错误、类型、optional peer loader、process 和 filesystem helper。
- `pretend-act/github`：本地 GitHub workflow simulation 的常用 facade。
- `pretend-act/github-core`：act runner、workflow overlay 和 MockGithub replacement sandbox。
- `pretend-act/github-artifacts`：本地 artifact store 和 report helper。
- `pretend-act/github-registry`：event payload 与 GitHub context helper；面向 GitHub 调用方 re-export Git registry helper。
- `pretend-act/git-registry`：跨平台 Git registry、checkout snapshot 与可选 HTTP transport helper。
- `pretend-act/npm-registry`：npm registry 配置和 lifecycle helper。
- `pretend-act/crates-registry`：Cargo registry 配置和 lifecycle helper。
- `pretend-act/docker-registry`：本地 OCI Distribution registry lifecycle helper。

## Runner 模型

Runner 构造明确的 command spec，并在受控 child process 中执行 `act` binary。结果对象保留 command metadata、exit code、stdout、stderr、combined raw log 和保守 status。只有在可靠时才填充 step 级细节。

## Sandbox 模型

Sandbox 将 workspace 复制到临时 repository，初始化 git，准备 event payload，应用 workflow overlay，并负责 cleanup。它支持 keep-on-failure 用于调试，但默认行为是清理。

## Git Registry 模型

`createGitRegistry` 会创建一个本地 Git registry，用来支撑 `actions/checkout` replacement step。这是默认 source simulation 层：workflow 从 Git remote fetch ref，而不是通过大范围 bind mount 直接看到调用方 workspace。脏工作区会先把选定 base commit materialize 到临时 snapshot worktree，再按共享 `.gitignore`/默认 ignore filter 同步调用方 workspace，写入新的 tree object，并把 snapshot commit 发布到 registry。显式 commit SHA、tag 和 clean branch ref 会直接发布选定 commit，避免用户刻意指定的 source 混入本地脏改。

Git object 操作由 `isomorphic-git` 实现；运行 Pretend Act 的宿主机不需要系统 `git` binary。默认 remote 是本地 `file:` URL；`transport: "http"` 会启动纯 Node HTTP transport，服务无法访问本地 filesystem registry URL 的 runner。bind mount 仍可作为 `act` 提供 runner workspace 的传输细节，但不是权威 checkout source。

## Workflow Overlay 模型

Overlay 只应用到复制出来的 workflow 文件。Step 可以按 id、name、`uses`、`run` 或 index 匹配。支持 replace、skip、before 和 after。

## Optional Peer 模型

根入口不需要的集成依赖都作为 optional peer。实现会在需要的 subpath 中动态加载；缺失时抛出带安装提示的 `PretendActOptionalPeerError`。

## 文件系统模型

默认执行路径使用 materialized 真实文件系统，因为 `act`、Git、npm、Cargo 和 Docker 都是外部进程。`@platformatic/vfs` 作为 optional backend 用于测试、overlay 和内部生成文件，但 Pretend Act 默认不会全局 mount 它。

## Registry 模型

Remote mock publishing 会把 workflow 指向本地服务，而不是降级 publish steps。npm 使用 Verdaccio。Docker 使用官方 OCI Distribution `registry:3` runtime。Cargo server 实现 Cargo 需要的核心 sparse registry 与 Web API：publish、yank、unyank、owners、search、metadata、download 和 index files。GitHub API helper 隔离在 `github-registry` 模块，并动态加载 Octokit。

[English](../en/001-ARCHITECTURE.md) | [中文](001-ARCHITECTURE.md)