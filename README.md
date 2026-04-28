# PRETEND-ACT

Pretend Act is a modern, programmatic local GitHub Actions toolkit built around [`nektos/act`](https://github.com/nektos/act). It is designed for projects that want an explicit, well-scoped, and migration-friendly workflow testing layer while continuing to build on the broader `act` ecosystem.

The first release line targets real workflow simulation needs: run and validate workflows, stage a temporary repository, overlay local-only workflow changes, capture raw logs, keep structured run results, and provide registry/artifact helpers for release pipelines.

[中文](README_zh.md)

## Why

Local workflow tests need more than a thin process wrapper. Pretend Act exposes GitHub Actions concepts first, keeps engine-specific details behind explicit boundaries, and makes local simulation behavior visible:

- source workflows are never modified in place;
- imports and constructors do not write `~/.actrc` or other user home files;
- environment patches are scoped and restorable;
- raw logs and exit codes are the reliable status source;
- optional integrations are subpath imports and optional peer dependencies;
- local overlays make unsupported hosted actions explicit during local simulation.

## Install

```sh
pnpm add -D pretend-act
```

Optional integrations such as the Agent CI engine, GitHub API clients, memory VFS, Verdaccio-backed npm registry mocks, and Dockerode-backed Docker registry mocks are declared as optional peers. Core workflow overlay and checkout support are installed with the package.

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

Primary exports:

- `pretend-act`: lightweight core errors and shared types.
- `pretend-act/github`: convenience facade for most GitHub workflow testing.
- `pretend-act/runner`: engine-agnostic workflow runner orchestration.
- `pretend-act/engine`: engine adapters for `act` and the optional Agent CI backend.
- `pretend-act/actions`: action pretender rules and built-in pretender factories.
- `pretend-act/workflows`: workflow overlay model and transformation helpers.
- `pretend-act/github-core`: GitHub Actions environment primitives and migration helpers.
- `pretend-act/config`: typed configuration helpers for `pretend-act.config.ts` and programmatic setup.
- `pretend-act/github-artifacts`: local artifact store and report helpers.
- `pretend-act/github-registry`: GitHub event/context helpers.
- `pretend-act/git-registry`: cross-platform Git registry, checkout snapshot, and optional HTTP transport helpers.
- `pretend-act/npm-registry`: npm registry configuration and Verdaccio lifecycle helpers.
- `pretend-act/crates-registry`: Cargo sparse registry and core Web API mock helpers.
- `pretend-act/docker-registry`: local OCI Distribution registry lifecycle helpers.

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

Agent CI can be used as a workflow-first optional engine when the `agent-ci` binary from `@redwoodjs/agent-ci` is available through `PATH` or `AGENT_CI_BINARY`:

```ts
const runner = new PretendRunner({
	cwd: process.cwd(),
	engine: new AgentCiEngine({ quiet: true }),
	workflowFile: ".github/workflows/ci.yml",
});

await runner.runWorkflow();
```

## Remote Mock Publishing

Remote mock publishing lets release workflows run publish branches against local services instead of disabling them for local validation. `createRemoteMockContainer()` starts the selected services and `createRemoteMockPretenders()` turns them into conservative workflow rewrites:

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

The built-in npm and Cargo pretenders match simple `npm publish`, `pnpm publish`, and `cargo publish` run steps, write local registry config, and leave steps with explicit registry overrides unchanged. Docker publish rewriting is available only by explicit opt-in through `createDockerPublishPretender()` or `createRemoteMockPretenders(remoteMock, { docker: ... })`, because registry reachability and tag rewriting depend on the runner/container boundary.

## Configuration

`pretend-act.config.ts` can describe the desired GitHub Actions model first and keep engine-specific options under `engine.options`:

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

The default checkout simulation path is a Git remote, not a broad bind of the caller workspace. `createGithubActionsContainer` copies the configured repository source into a sandbox for workflow overlays and also creates an `injection-js` injector with built-in providers such as `GithubActionsWorkspaceToken` and `GithubCheckoutBackendToken`. The checkout provider is a filtered local Git registry snapshot that backs the built-in `actions/checkout` pretender. The checkout remote uses `isomorphic-git`, so the host running the toolkit does not need a system `git` binary and large ignored directories such as `node_modules` are not exposed by accident.

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

Pass `repository.checkout: false` to `createGithubActionsContainer` when a test needs only the copy-managed sandbox workspace and does not need an `actions/checkout` replacement. In that case `container.get(GithubCheckoutBackendToken)` returns `undefined` and `container.require(GithubCheckoutBackendToken)` throws a typed `PretendActError`.

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

The remote-mock path now has an initial reusable pretender bundle. Workflows can execute simple npm and Cargo publish branches against local Verdaccio and Cargo sparse registry services instead of branching on local execution. Docker uses Dockerode to manage the official OCI Distribution registry runtime, but Docker publish step rewriting remains explicit opt-in while registry reachability across host, `act`, and Agent CI container boundaries is refined. Remote-mock helpers include a denylist for real publishing endpoints so local validation fails fast instead of accidentally targeting production registries.

See the detailed docs:

- [Overview](docs/en/000-OVERVIEW.md)
- [Architecture](docs/en/001-ARCHITECTURE.md)
- [API](docs/en/002-API.md)
- [Roadmap](docs/en/100-ROADMAP.md)