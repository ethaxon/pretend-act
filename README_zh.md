# PRETEND-ACT

Pretend Act 是一个基于 [`nektos/act`](https://github.com/nektos/act) 的现代化、程序化本地 GitHub Actions 工具包。它面向希望拥有行为显式、边界清楚、且便于迁移的 workflow 测试层的项目，同时继续建立在更广泛的 `act` 生态之上。

首轮实现直接面向真实 workflow 模拟需求：运行和验证 workflow、创建临时仓库、叠加本地专用 workflow 修改、捕获原始日志、返回结构化结果，并提供 release pipeline 常用的 artifact 与 registry helper。

[English](README.md)

## 为什么

`act-js` 和 `mock-github` 等既有项目展示了程序化封装 `act` 的价值。Pretend Act 延续这类使用体验，并提供 TypeScript-first API 与显式的本地模拟行为：

- 不原地修改源 workflow；
- import 和 constructor 不写 `~/.actrc` 或其他用户 home 文件；
- 环境变量修改有作用域并可恢复；
- 以 raw log 和 exit code 作为可靠状态来源；
- 可选集成通过 subpath import 和 optional peer dependency 进入；
- 对本地不支持的 hosted action 使用显式 overlay，让本地模拟行为更清楚。

## 安装

```sh
pnpm add -D pretend-act yaml ignore
```

`yaml` 和 `ignore` 是 optional peer，因为只有 GitHub workflow overlay 和 workspace copy 模块需要它们。根入口保持轻量。

## Subpath Imports

```ts
import { PretendActError } from "pretend-act";
import {
	ActRunner,
	createCheckoutGitServer,
	createCheckoutMockStep,
	withMockGithub,
} from "pretend-act/github";
import { createArtifactStore } from "pretend-act/github-artifacts";
import { createGitRegistry, startGitHttpTransport } from "pretend-act/git-registry";
import { startNpmRegistry } from "pretend-act/npm-registry";
import { startCratesRegistry } from "pretend-act/crates-registry";
import { startDockerRegistry } from "pretend-act/docker-registry";
```

主要出口：

- `pretend-act`：轻量 core 错误与共享类型。
- `pretend-act/github`：常用 GitHub workflow 测试 facade。
- `pretend-act/github-core`：runner、sandbox、workflow overlay primitives。
- `pretend-act/github-artifacts`：本地 artifact store 与 report helper。
- `pretend-act/github-registry`：GitHub event/context helper。
- `pretend-act/git-registry`：跨平台 Git registry、checkout snapshot 与可选 HTTP transport helper。
- `pretend-act/npm-registry`：npm registry 配置与 Verdaccio lifecycle helper。
- `pretend-act/crates-registry`：Cargo sparse registry 与核心 Web API mock helper。
- `pretend-act/docker-registry`：本地 OCI Distribution registry lifecycle helper。

## Quickstart

```ts
import { ActRunner, withMockGithub } from "pretend-act/github";

await withMockGithub(
	{
		workspacePath: process.cwd(),
		repoName: "example",
		ignore: [".git", "node_modules", "target", "dist-tsc"],
	},
	async (sandbox) => {
		const runner = new ActRunner({
			cwd: sandbox.repoPath,
			workflowFile: ".github/workflows/release.yml",
		});

		runner.setEnv("LOCAL_ACTIONS", "true");
		runner.setInput("publish_npm", "false");

		const result = await runner.runEvent("workflow_dispatch", {
			bind: true,
			mockSteps: {
				"release-plan": [
					{
						uses: "actions/checkout@v6",
						mockWith: { if: "${{ false }}" },
					},
				],
			},
		});

		if (!result.success) {
			throw new Error(`Workflow failed. Raw log: ${result.rawLog}`);
		}
	},
);
```

## Git Registry Checkout

默认 checkout simulation 路径是 Git remote，而不是把调用方 workspace 大范围 bind 进去。Pretend Act 使用 `isomorphic-git` 创建 filtered local Git registry snapshot，因此运行 toolkit 的宿主机不需要系统 `git` binary，也不会一不小心暴露 `node_modules` 这类大型 ignored 目录。

```ts
await withMockGithub({ workspacePath: process.cwd() }, async (sandbox) => {
	const checkoutRemote = await createGitRegistry({
		workspacePath: process.cwd(),
	});

	const runner = new ActRunner({ cwd: sandbox.repoPath });
	await runner.runEvent("workflow_dispatch", {
		bind: true,
		mockSteps: {
			"release-plan": [
				{
					uses: "actions/checkout@v6",
					mockWith: createCheckoutMockStep(checkoutRemote),
				},
			],
		},
	});
});
```

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

下一阶段是 `remote-mock`：workflow 应执行 publish/upload/push 分支，但目标指向本地 mock services，而不是根据本地运行直接降级。npm 使用 Verdaccio，crates 使用具备核心 Web API 的 Cargo sparse registry mock，Docker 使用官方 OCI Distribution registry runtime，GitHub API client 放在 `github-registry` 边界内。Remote-mock helper 带真实发布端点 denylist，避免本地验证意外打到生产 registry。

详细文档：

- [概览](docs/zh/000-OVERVIEW.md)
- [架构](docs/zh/001-ARCHITECTURE.md)
- [API](docs/zh/002-API.md)
- [路线图](docs/zh/100-ROADMAP.md)