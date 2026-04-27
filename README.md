# PRETEND-ACT

Pretend Act is a modern, programmatic local GitHub Actions toolkit built around [`nektos/act`](https://github.com/nektos/act). It is designed for projects that want an explicit, well-scoped, and migration-friendly workflow testing layer while continuing to build on the broader `act` ecosystem.

The first release line targets real workflow simulation needs: run and validate workflows, stage a temporary repository, overlay local-only workflow changes, capture raw logs, keep structured run results, and provide registry/artifact helpers for release pipelines.

[中文](README_zh.md)

## Why

Existing projects such as `act-js` and `mock-github` showed how useful a programmatic wrapper around `act` can be. Pretend Act builds on that style with a TypeScript-first surface and explicit local-simulation behavior:

- source workflows are never modified in place;
- imports and constructors do not write `~/.actrc` or other user home files;
- environment patches are scoped and restorable;
- raw logs and exit codes are the reliable status source;
- optional integrations are subpath imports and optional peer dependencies;
- local overlays make unsupported hosted actions explicit during local simulation.

## Install

```sh
pnpm add -D pretend-act yaml ignore
```

`yaml` and `ignore` are optional peers because only the GitHub workflow overlay and workspace-copy modules need them. Root imports stay lightweight.

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

Primary exports:

- `pretend-act`: lightweight core errors and shared types.
- `pretend-act/github`: convenience facade for most GitHub workflow testing.
- `pretend-act/github-core`: runner, sandbox, and workflow overlay primitives.
- `pretend-act/github-artifacts`: local artifact store and report helpers.
- `pretend-act/github-registry`: GitHub event/context helpers.
- `pretend-act/git-registry`: cross-platform Git registry, checkout snapshot, and optional HTTP transport helpers.
- `pretend-act/npm-registry`: npm registry configuration and Verdaccio lifecycle helpers.
- `pretend-act/crates-registry`: Cargo sparse registry and core Web API mock helpers.
- `pretend-act/docker-registry`: local OCI Distribution registry lifecycle helpers.

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

The default checkout simulation path is a Git remote, not a broad bind of the caller workspace. Pretend Act creates a filtered local Git registry snapshot with `isomorphic-git`, so the host running the toolkit does not need a system `git` binary and large ignored directories such as `node_modules` are not exposed by accident.

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

Dirty workspaces are captured by materializing the selected base commit into a temporary snapshot worktree, syncing the caller workspace through the shared `.gitignore`/default ignore filter, writing a new tree object, and publishing that commit into the registry. Explicit commit SHAs, tags, and clean branches publish the selected commit directly, so intentionally selected immutable sources are not polluted by local dirty state. A bind mount may still be useful as an `act` runner transport detail, but it is not the source-of-truth checkout simulation layer.

The default registry remote is a local `file:` URL. When the runner cannot reach that filesystem path, opt into a pure Node HTTP transport:

```ts
const checkoutRemote = await createGitRegistry({
	workspacePath: process.cwd(),
	transport: "http",
	http: {
		port: 8174,
		// Use publicUrl when a container must fetch through a mapped host name.
		publicUrl: "http://host.docker.internal:8174/repo.git",
	},
});
```

## Migration Status

The initial implementation focuses on a practical migration path for projects that currently combine programmatic `act` runners and mock GitHub repositories to run local workflow simulations. It supports act binary resolution, validate/dry-run/run commands, workflow dispatch inputs, env/secrets/vars, container options, workspace staging, local-only workflow overlays, raw log capture, and deterministic cleanup.

The next mode is `remote-mock`: workflows should execute publish/upload/push branches against local mock services instead of branching on local execution. npm uses Verdaccio, crates uses a Cargo sparse registry mock with core Web API support, Docker uses the official OCI Distribution registry runtime, and GitHub API clients live behind the `github-registry` boundary. Remote-mock helpers include a denylist for real publishing endpoints so local validation fails fast instead of accidentally targeting production registries.

See the detailed docs:

- [Overview](docs/en/000-OVERVIEW.md)
- [Architecture](docs/en/001-ARCHITECTURE.md)
- [API](docs/en/002-API.md)
- [Roadmap](docs/en/100-ROADMAP.md)