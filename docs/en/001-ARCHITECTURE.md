# Architecture

Pretend Act is split by runtime cost and integration boundary. The root package is lightweight. GitHub workflow execution, artifact storage, and registry helpers live behind explicit subpath exports.

## Modules

- `pretend-act`: shared errors, types, optional peer loader, process and filesystem helpers.
- `pretend-act/github`: convenience facade for local GitHub workflow simulation.
- `pretend-act/runner`: engine-agnostic workflow run orchestration.
- `pretend-act/engine`: engine adapters for `act` and the optional `agent-ci` CLI backend.
- `pretend-act/actions`: action pretender matching, compilation, and built-in pretender factories.
- `pretend-act/workflows`: engine-independent workflow overlay model and transformation helpers.
- `pretend-act/github-core`: GitHub Actions environment primitives and migration helpers.
- `pretend-act/config`: typed configuration helpers for config files and programmatic setup.
- `pretend-act/github-artifacts`: local artifact store and report helpers.
- `pretend-act/github-registry`: event payload and GitHub context helpers; re-exports Git registry helpers for GitHub-oriented callers.
- `pretend-act/git-registry`: cross-platform Git registry, checkout snapshot, and optional HTTP transport helpers.
- `pretend-act/npm-registry`: npm registry configuration and lifecycle helpers.
- `pretend-act/crates-registry`: Cargo registry configuration and lifecycle helpers.
- `pretend-act/docker-registry`: local OCI Distribution registry lifecycle helpers.

## Runner Model

The runner prepares a GitHub Actions run without owning any engine-specific behavior: it checks engine capabilities, compiles action pretenders, stages a derived workflow when overlays are active, resolves the sandbox working directory, and then passes a prepared request to an engine adapter. Source workflow files are not mutated in place. The result object keeps command metadata, exit code, stdout, stderr, combined raw log, and a conservative status. Step-level details are only populated when they can be derived safely.

Engine-specific details live behind an explicit engine boundary. Each engine declares capabilities so the runner can fail early with engine-aware errors. The `act` adapter builds the act command spec and executes the binary in a controlled child process. The `agent-ci` adapter maps workflow-first requests to the `@redwoodjs/agent-ci` CLI and intentionally rejects request fields that the backend cannot model yet, such as event payload injection or single-job selection. The public configuration describes GitHub Actions concepts first, then stores backend options under `engine.options`, so future runners do not have to inherit `act` option names.

## Sandbox Model

The sandbox treats the configured repository source as input that can be exposed through multiple local backends. The high-level `createGithubActionsContainer` API accepts a `repository` object with GitHub-like fields such as owner, name, ref, sha, and source. The container copies the repository source into a temporary repository for workflow overlays and runner-visible files, and it creates a checkout remote backend that can power the built-in `actions/checkout` pretender with a real Git fetch. It initializes git in the copied repository when requested and cleans itself up through `[Symbol.asyncDispose]`. Tests that only need the copied workspace can opt out of the checkout backend with `repository.checkout: false`.

## Git Registry Model

`createGitRegistry` creates a local Git registry that can back a replacement step for `actions/checkout`. This is the default source simulation layer: a workflow fetches a ref from a Git remote rather than seeing the caller workspace through a broad bind mount. Dirty working tree state is captured by materializing the selected base commit into a temporary snapshot worktree, syncing the caller workspace through the shared `.gitignore`/default ignore filter, writing a fresh tree object, and publishing the snapshot commit into the registry. Explicit commit SHAs, tags, and clean branch refs publish the selected commit directly so intentionally selected sources remain immutable.

Git object manipulation is implemented with `isomorphic-git`; the host running Pretend Act does not need a system `git` binary. The default remote is a local `file:` URL, and `transport: "http"` starts a pure Node HTTP transport for runners that cannot reach the local filesystem registry URL. A bind mount may still be used by `act` to provide the runner workspace, but it is not the authoritative checkout source.

## Workflow Overlay Model

Overlays are engine-independent operations applied to prepared workflow files only. A step can be matched by id, name, `uses`, `run`, or index. Supported operations include replacing a step, skipping a step, inserting before a matched step, inserting after a matched step, and keeping a matched step unchanged. Action pretenders compile action-level rules into this overlay model before the engine adapter runs. Pretender context includes the current engine type and capabilities so built-in and custom pretenders can choose whether to apply for a backend.

## Optional Peer Model

Integrations that are not needed by the root import are optional peers. The implementation loads them dynamically from the subpath that needs them and raises `PretendActOptionalPeerError` with an install hint when missing.

## Filesystem Model

The default execution path uses a real materialized filesystem because `act`, Git, npm, Cargo, and Docker run as external processes. `@platformatic/vfs` is available as an optional backend for tests, overlays, and internal generated files, but Pretend Act does not globally mount it by default.

## Registry Model

Remote mock publishing points workflows at local services instead of downgrading publish steps. npm uses Verdaccio. Docker uses Dockerode to manage the official OCI Distribution `registry:3` runtime. The Cargo server implements the core sparse registry and Web API surface needed by Cargo: publish, yank, unyank, owners, search, metadata, download, and index files. GitHub API helpers are isolated behind the `github-registry` module and dynamically load Octokit.

The remote mock pretender bundle lives in `pretend-act/actions`. It compiles conservative npm/Cargo publish rewrites into workflow overlay operations and carries the remote mock `env`, `secrets`, and injection providers that callers can pass into `PretendRunner` or `createGithubActionsContainer`. Docker publishing remains opt-in because registry reachability and tag rewriting differ across host, `act`, and Agent CI container boundaries.

[English](001-ARCHITECTURE.md) | [中文](../zh/001-ARCHITECTURE.md)