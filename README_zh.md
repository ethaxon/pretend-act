# PRETEND-ACT

Pretend Act 是一个基于 [`nektos/act`](https://github.com/nektos/act) 的现代化、程序化本地 GitHub Actions 工具包。它面向希望拥有行为显式、边界清楚、且便于迁移的 workflow 测试层的项目，同时继续建立在更广泛的 `act` 生态之上。

首轮实现直接面向真实 workflow 模拟需求：运行和验证 workflow、创建临时仓库、叠加本地专用 workflow 修改、捕获原始日志、返回结构化结果，并提供 release pipeline 常用的 artifact 与 registry helper。

[English](README.md)

## 为什么

本地 workflow 测试需要的不只是薄薄一层进程封装。Pretend Act 优先暴露 GitHub Actions 概念，将 engine 专属细节放在明确边界之后，并让本地模拟行为保持可见：

- 不原地修改源 workflow；
- import 和 constructor 不写 `~/.actrc` 或其他用户 home 文件；
- 环境变量修改有作用域并可恢复；
- 以 raw log 和 exit code 作为可靠状态来源；
- 可选集成通过 subpath import 和 optional peer dependency 进入；
- 对本地不支持的 hosted action 使用显式 overlay，让本地模拟行为更清楚。

## 安装

```sh
pnpm add -D pretend-act
```

Agent CI engine、GitHub API client、memory VFS、基于 Verdaccio 的 npm registry mock、基于 Dockerode 的 Docker registry mock 这类可选集成会声明为 optional peer。核心 workflow overlay 和 checkout 支持会随 package 一起安装。

## Subpath Imports

```ts
import { PretendActError } from "pretend-act";
import { createCheckoutPretender, createRemoteMockPretenders } from "pretend-act/actions";
import { defineConfig, PretendEngineType } from "pretend-act/config";
import { ActEngine, AgentCiEngine } from "pretend-act/engine";
import { createGithubActionsContainer, createRemoteMockContainer } from "pretend-act/github";
import { createArtifactStore } from "pretend-act/github-artifacts";
import { createGitRegistry, startGitHttpTransport } from "pretend-act/git-registry";
import { PretendRunner } from "pretend-act/runner";
import { startNpmRegistry } from "pretend-act/npm-registry";
import { startCratesRegistry } from "pretend-act/crates-registry";
import { startDockerRegistry } from "pretend-act/docker-registry";
```

主要出口：

- `pretend-act`：轻量 core 错误与共享类型。
- `pretend-act/github`：常用 GitHub workflow 测试 facade。
- `pretend-act/runner`：engine 无关的 workflow runner 编排层。
- `pretend-act/engine`：`act` 和可选 Agent CI backend 的 engine adapter。
- `pretend-act/actions`：action pretender rule 与内置 pretender factory。
- `pretend-act/workflows`：workflow overlay model 与转换 helper。
- `pretend-act/github-core`：GitHub Actions environment primitives 与迁移 helper。
- `pretend-act/config`：用于 `pretend-act.config.ts` 和程序式 setup 的类型化配置 helper。
- `pretend-act/github-artifacts`：本地 artifact store 与 report helper。
- `pretend-act/github-registry`：GitHub event/context helper。
- `pretend-act/git-registry`：跨平台 Git registry、checkout snapshot 与可选 HTTP transport helper。
- `pretend-act/npm-registry`：npm registry 配置与 Verdaccio lifecycle helper。
- `pretend-act/crates-registry`：Cargo sparse registry 与核心 Web API mock helper。
- `pretend-act/docker-registry`：本地 OCI Distribution registry lifecycle helper。

## Quickstart

```ts
import { createCheckoutPretender, createRemoteMockPretenders } from "pretend-act/actions";
import { ActEngine } from "pretend-act/engine";
import {
	createGithubActionsContainer,
	createRemoteMockContainer,
	GithubActionsWorkspaceToken,
} from "pretend-act/github";
import { PretendRunner } from "pretend-act/runner";

await using remoteMock = await createRemoteMockContainer({ npm: true, crates: true });
const remoteMockPretenders = createRemoteMockPretenders(remoteMock);

await using container = await createGithubActionsContainer({
	providers: remoteMockPretenders.providers,
	repository: {
		name: "example",
		source: {
			path: process.cwd(),
			ignore: [".git", "node_modules", "target", "dist-tsc"],
		},
	},
});
const workspace = container.require(GithubActionsWorkspaceToken);

const runner = new PretendRunner({
	cwd: workspace.repoPath,
	engine: new ActEngine(),
	injector: container.injector,
	workflowFile: ".github/workflows/release.yml",
	actions: {
		checkout: createCheckoutPretender(),
		...remoteMockPretenders.actions,
	},
});

const result = await runner.runEvent("workflow_dispatch", {
	engineOptions: { bind: true },
	env: { LOCAL_ACTIONS: "true", ...remoteMockPretenders.env },
	secrets: remoteMockPretenders.secrets,
	inputs: {
		publish_npm: "true",
		publish_crates: "true",
	},
});

if (!result.success) {
	throw new Error(`Workflow failed. Raw log: ${result.rawLog}`);
}
```

当 `@redwoodjs/agent-ci` 提供的 `agent-ci` binary 能通过 `PATH` 或 `AGENT_CI_BINARY` 找到时，可以把 Agent CI 作为 workflow-first 的可选 engine 使用：

```ts
const runner = new PretendRunner({
	cwd: process.cwd(),
	engine: new AgentCiEngine({ quiet: true }),
	workflowFile: ".github/workflows/ci.yml",
});

await runner.runWorkflow();
```

## Remote Mock Publishing

Remote mock publishing 让 release workflow 在本地验证时真正执行 publish 分支，但目标指向本地服务，而不是直接关闭发布分支。`createRemoteMockContainer()` 会启动所选服务，`createRemoteMockPretenders()` 会把这些服务转换成保守的 workflow rewrite：

```ts
await using remoteMock = await createRemoteMockContainer({ npm: true, crates: true });
const bundle = createRemoteMockPretenders(remoteMock);

const runner = new PretendRunner({
	cwd: process.cwd(),
	engine: new ActEngine(),
	actions: bundle.actions,
});

await runner.runEvent("workflow_dispatch", {
	env: bundle.env,
	secrets: bundle.secrets,
});
```

内置 npm 和 Cargo pretender 会匹配简单的 `npm publish`、`pnpm publish` 和 `cargo publish` run step，写入本地 registry 配置，并保持已经显式指定 registry override 的 step 不变。Docker publish rewrite 只能通过 `createDockerPublishPretender()` 或 `createRemoteMockPretenders(remoteMock, { docker: ... })` 显式 opt in，因为 registry 可达性和 tag rewrite 取决于 runner/container 边界。

## Configuration

`pretend-act.config.ts` 可以先描述期望的 GitHub Actions 模型，并把 engine 相关选项放在 `engine.options` 下：

```ts
import { defineConfig, PretendEngineType } from "pretend-act/config";

export default defineConfig({
	engine: {
		type: PretendEngineType.Act,
		options: {
			actBinary: "act",
		},
	},
	actions: {
		"actions/checkout": {
			test: /actions\/checkout@.*/i,
			pretender: (step) => ({
				...step,
				run: "git fetch origin",
			}),
		},
	},
	runner: {
		github: {
			repository: {
				name: "example",
				source: { path: process.cwd() },
			},
		},
	},
});
```

## Git Registry Checkout

默认 checkout simulation 路径是 Git remote，而不是把调用方 workspace 大范围 bind 进去。`createGithubActionsContainer` 会把配置的 repository source 复制到 sandbox，用于 workflow overlay，同时创建一个 `injection-js` injector，内置 `GithubActionsWorkspaceToken`、`GithubCheckoutBackendToken` 等 provider。Checkout provider 是可支撑内置 `actions/checkout` pretender 的 filtered local Git registry snapshot。Checkout remote 使用 `isomorphic-git`，因此运行 toolkit 的宿主机不需要系统 `git` binary，也不会一不小心暴露 `node_modules` 这类大型 ignored 目录。

```ts
await using container = await createGithubActionsContainer({
	repository: {
		name: "example",
		source: { path: process.cwd() },
	},
});
const workspace = container.require(GithubActionsWorkspaceToken);

const runner = new PretendRunner({
	cwd: workspace.repoPath,
	engine: new ActEngine(),
	injector: container.injector,
	actions: {
		checkout: createCheckoutPretender(),
	},
});
await runner.runEvent("workflow_dispatch", {
	engineOptions: { bind: true },
});
```

如果测试只需要由 copy 管理的 sandbox workspace，不需要 `actions/checkout` replacement，可以向 `createGithubActionsContainer` 传入 `repository.checkout: false`。此时 `container.get(GithubCheckoutBackendToken)` 返回 `undefined`，`container.require(GithubCheckoutBackendToken)` 会抛出类型化的 `PretendActError`。

脏工作区会先把选定 base commit materialize 到临时 snapshot worktree，再按共享 `.gitignore`/默认 ignore filter 同步调用方 workspace，写入新的 tree object，并把该 commit 发布到 registry。显式 commit SHA、tag 和 clean branch 会直接发布选定 commit，避免用户刻意指定的 immutable source 混入本地脏改。bind mount 仍可作为 `act` runner 的传输细节，但不作为 source-of-truth checkout simulation 层。

默认 registry remote 是本地 `file:` URL。如果 runner 无法访问该 filesystem path，可以显式启用纯 Node HTTP transport：

```ts
const checkoutRemote = await createGitRegistry({
	workspacePath: process.cwd(),
	transport: "http",
	http: {
		port: 8174,
		// 当 container 需要通过映射 host name fetch 时使用 publicUrl。
		publicUrl: "http://host.docker.internal:8174/repo.git",
	},
});
```

## 迁移状态

首轮实现聚焦 practical migration path：为已有程序化 `act` runner 与 mock GitHub repository 组合的本地 workflow simulation 项目，提供可迁移的 runner、sandbox、overlay、raw log 和 cleanup 能力。

Remote-mock 路径现在已有初始可复用 pretender bundle。Workflow 可以执行简单 npm 和 Cargo publish 分支，并把目标指向本地 Verdaccio 与 Cargo sparse registry，而不是根据本地运行直接降级。Docker 使用 Dockerode 管理官方 OCI Distribution registry runtime，但在 host、`act` 和 Agent CI container 边界之间的 registry 可达性策略稳定前，Docker publish step rewrite 仍保持显式 opt in。Remote-mock helper 带真实发布端点 denylist，避免本地验证意外打到生产 registry。

详细文档：

- [概览](docs/zh/000-OVERVIEW.md)
- [架构](docs/zh/001-ARCHITECTURE.md)
- [API](docs/zh/002-API.md)
- [路线图](docs/zh/100-ROADMAP.md)