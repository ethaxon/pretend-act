# Architecture

Pretend Act is split by runtime cost and integration boundary. The root package is lightweight. GitHub workflow execution, artifact storage, and registry helpers live behind explicit subpath exports.

## Modules

- `pretend-act`: shared errors, types, optional peer loader, process and filesystem helpers.
- `pretend-act/github`: convenience facade for local GitHub workflow simulation.
- `pretend-act/github-core`: act runner, workflow overlay, and MockGithub replacement sandbox.
- `pretend-act/github-artifacts`: local artifact store and report helpers.
- `pretend-act/github-registry`: event payload and GitHub context helpers; re-exports Git registry helpers for GitHub-oriented callers.
- `pretend-act/git-registry`: cross-platform Git registry, checkout snapshot, and optional HTTP transport helpers.
- `pretend-act/npm-registry`: npm registry configuration and lifecycle helpers.
- `pretend-act/crates-registry`: Cargo registry configuration and lifecycle helpers.
- `pretend-act/docker-registry`: local OCI Distribution registry lifecycle helpers.

## Runner Model

The runner builds an explicit command spec and executes the `act` binary in a controlled child process. The result object keeps command metadata, exit code, stdout, stderr, combined raw log, and a conservative status. Step-level details are only populated when they can be derived safely.

## Sandbox Model

The sandbox copies a workspace into a temporary repository, initializes git, prepares event payloads, applies workflow overlays, and cleans itself up. It supports keep-on-failure for debugging, but cleanup is the default.

## Git Registry Model

`createGitRegistry` creates a local Git registry that can back a replacement step for `actions/checkout`. This is the default source simulation layer: a workflow fetches a ref from a Git remote rather than seeing the caller workspace through a broad bind mount. Dirty working tree state is captured by materializing the selected base commit into a temporary snapshot worktree, syncing the caller workspace through the shared `.gitignore`/default ignore filter, writing a fresh tree object, and publishing the snapshot commit into the registry. Explicit commit SHAs, tags, and clean branch refs publish the selected commit directly so intentionally selected sources remain immutable.

Git object manipulation is implemented with `isomorphic-git`; the host running Pretend Act does not need a system `git` binary. The default remote is a local `file:` URL, and `transport: "http"` starts a pure Node HTTP transport for runners that cannot reach the local filesystem registry URL. A bind mount may still be used by `act` to provide the runner workspace, but it is not the authoritative checkout source.

## Workflow Overlay Model

Overlays are applied to copied workflow files only. A step can be matched by id, name, `uses`, `run`, or index. Supported operations include replacing a step, skipping a step, appending before a matched step, and appending after a matched step.

## Optional Peer Model

Integrations that are not needed by the root import are optional peers. The implementation loads them dynamically from the subpath that needs them and raises `PretendActOptionalPeerError` with an install hint when missing.

## Filesystem Model

The default execution path uses a real materialized filesystem because `act`, Git, npm, Cargo, and Docker run as external processes. `@platformatic/vfs` is available as an optional backend for tests, overlays, and internal generated files, but Pretend Act does not globally mount it by default.

## Registry Model

Remote mock publishing points workflows at local services instead of downgrading publish steps. npm uses Verdaccio. Docker uses the official OCI Distribution `registry:3` runtime. The Cargo server implements the core sparse registry and Web API surface needed by Cargo: publish, yank, unyank, owners, search, metadata, download, and index files. GitHub API helpers are isolated behind the `github-registry` module and dynamically load Octokit.

[English](001-ARCHITECTURE.md) | [中文](../zh/001-ARCHITECTURE.md)