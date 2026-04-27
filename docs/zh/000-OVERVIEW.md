# 概览

Pretend Act 是一个本地 workflow simulation 工具包，面向那些需要的不只是 shell 调用 `act` 的项目。它提供程序化 runner、一次性 mock repository、workflow overlay、artifact helper，以及 release automation 可复用的 registry 配置 helper。

首轮实现是 practical replacement，目标是替换常见的 `@kie/act-js` + `@kie/mock-github` 组合，尤其覆盖 SecurityDept release workflow simulation 的使用方式。

## 目标

- 通过 `nektos/act` 运行、验证和 dry-run GitHub Actions workflow。
- 创建临时 repository，并避免复制沉重的构建产物。
- 只在 sandbox 中应用本地专用 workflow overlay，不修改源 workflow。
- 传入 workflow dispatch inputs、environment、variables 和 secrets。
- 捕获 raw log，并返回结构化运行结果。
- 默认可靠清理，并支持 keep-on-failure 调试模式。
- 为 release workflow 提供 artifact、npm registry、crates registry 和 GitHub context helper。
- 默认通过 filtered Git registry snapshot 模拟 `actions/checkout`，不要求宿主机安装 `git` binary，并支持跨 container 边界的可选 HTTP transport。

## 能力矩阵

| 能力 | 首轮状态 | 说明 |
| --- | --- | --- |
| act binary resolution | 支持 | `ACT_BINARY`、显式路径，然后 fallback 到 `act`。 |
| workflow validate | 支持 | 封装 `act --validate -W`。 |
| workflow dry-run | 支持 | 封装 `act <event> -n -W`。 |
| workflow run | 支持 | 支持 event 和 job filter。 |
| workflow dispatch inputs | 支持 | 支持 event payload 和 `--input` flags。 |
| env/secrets/vars | 支持 | runner 内部隔离状态。 |
| custom container options | 支持 | 覆盖 SecurityDept host UID/GID 场景。 |
| workflow overlay | 支持 | 在 sandbox 中 skip、replace、insert step。 |
| git registry checkout | 支持 | 脏工作区使用 filtered snapshot commit；显式 commit/tag/clean branch 直接发布选定 commit；支持本地 file transport 和可选 HTTP transport。 |
| MockGithub-like repository | 支持 | 临时 staged repo 和 cleanup。 |
| raw log capture | 支持 | stdout/stderr 与可选 log file。 |
| step-level parser | 部分支持 | 不可靠时标记 unknown。raw log 和 exit code 是权威来源。 |
| artifact service protocol parity | 部分支持 | 先提供 local store；完整协议进入 roadmap。 |
| npm/crates registry server | 支持 | Verdaccio lifecycle 与 Cargo sparse registry 核心 Web API mock。 |
| Docker registry | 部分支持 | 先提供本地 OCI Distribution lifecycle helper。 |
| remote-mock publish mode | 部分支持 | 已有服务编排入口；完整 SecurityDept 迁移是下一步。 |

## 非目标

Pretend Act 不是完整 GitHub Actions interpreter。`nektos/act` 仍是 workflow 执行后端。Pretend Act 负责其外层的程序化 API、本地 sandbox、overlay、结构化结果模型和可复用测试工具。

## 服务后端

Pretend Act 优先在正确层级使用成熟后端。npm 发布应走 Verdaccio。Docker 发布应走官方 OCI Distribution registry。GitHub API helper 只在 GitHub registry 模块内使用 Octokit。Cargo 发布采用聚焦的 sparse registry mock，因为 npm 生态目前没有成熟的 Cargo registry server。该 mock 覆盖核心 Cargo Web API：publish、yank、unyank、owners、search、sparse index files、metadata 和 downloads。

[English](../en/000-OVERVIEW.md) | [中文](000-OVERVIEW.md)