# Roadmap

Pretend Act starts as a practical replacement for local workflow simulation. The first implementation intentionally records deferred edge capabilities instead of pretending they are supported.

## Topic Decisions

### Agent CI Engine Boundary

The `agent-ci` adapter is a workflow-first engine, not an `act`-compatible event runner. It should keep mapping to `agent-ci run --workflow` or `--all` and reject request fields the backend cannot model yet, including event payload injection, workflow dispatch inputs, single-job selection, validation, and dry-run. This keeps the public API from inheriting `act`-specific command shapes as the default mental model.

Recommended follow-up work:

- Keep `runWorkflow()` as the preferred workflow-first entry point and make docs/examples distinguish it from event-first `act` execution.
- Track whether `@redwoodjs/agent-ci` exposes a stable library API. If it does, replace the CLI child-process executor without changing the Pretend Act engine boundary.

Implemented baseline:

- Engine capability metadata exists for `act` and `agent-ci`, and `PretendRunner` fails before staging or spawning when the request shape is unsupported.
- `AgentCiEngine` resolves the optional peer package bin before falling back to `PATH`, reports Agent CI-specific binary errors, and reads Agent CI run-result JSON through `AGENT_CI_STATE_DIR` to populate `RunResult.jobs` when possible.

Open questions:

- Whether upstream Agent CI should support separate repository root and workflow file paths, for example `--repo-root <path> --workflow <derived-file>`.
- Whether workflow dispatch inputs should stay unsupported for Agent CI or be represented by an explicit user opt-in helper. They must not be silently mapped to `vars`, because that changes GitHub Actions semantics.

### Generic Pretenders And Derived Workflows

Pretenders should stay engine-independent and produce workflow overlay operations. They should not patch engine internals. The runner should prepare a derived workflow before execution whenever overlays or pretenders are active, leaving source workflow files unchanged and making local simulation differences auditable.

This derived workflow path is required for third-party remote simulation that Agent CI does not provide by itself, such as npm, crates, GHCR, Docker Hub, and other external release APIs. Agent CI already covers many GitHub-side behaviors, so GitHub-native pretenders such as checkout/cache/artifacts should be gated by engine capability and should not be enabled by default for Agent CI when its backend can model them directly.

Recommended follow-up work:

- Keep derived workflows close to the repository root or sandbox root until Agent CI supports repository-root/workflow-path separation. This avoids incorrect repo-root inference from a workflow stored in an unrelated temp directory.

Implemented baseline:

- `PretendRunner` uses prepared workflow staging. It returns the original workflow when no transforms apply and writes a temporary derived workflow under the run `cwd` when overlays or pretenders produce operations.
- Action pretender context includes engine type and capabilities so pretenders can opt in or out by backend.
- The remote mock pretender MVP can route simple `npm publish`, `pnpm publish`, and `cargo publish` run steps to local registries through workflow overlays. Docker publish rewriting is available only through explicit opt-in helpers.

Open questions:

- Whether derived workflows should live in a disposable sandbox repository for all engines, or whether engines should be able to run the caller working tree with only the workflow file staged elsewhere.
- How much of SecurityDept's current local publish downgrade should migrate into generic remote pretenders versus project-specific action rules.
- How to make Docker registry URLs reliably reachable across host execution, `act` containers, and Agent CI containers without broad engine-specific assumptions.

## Deferred Features

- Full GitHub REST API mock parity beyond local workflow simulation.
- Full artifact service protocol parity for all `actions/upload-artifact` and `actions/download-artifact` versions.
- Hosted service container and network topology emulation beyond what `act` already provides.
- Deep matrix and job graph introspection when `act` output is insufficient.
- Exact legacy `act-js` API adapter if migration pressure justifies it after the modern facade is stable.
- Complete SecurityDept `remote-mock` migration that removes local publish downgrades from the workflow.
- Full Docker registry auth challenge and Bearer token parity.

## Removed Legacy Behaviors

- Writing `~/.actrc` or any user home file during import or construction.
- Mutating source workflow files in place.
- Global `process.env` mutation without snapshot and restore.
- Treating `act` emoji/text output parsing as the only source of truth.
- Hidden network interception that changes unrelated tests or caller process behavior.

[English](100-ROADMAP.md) | [中文](../zh/100-ROADMAP.md)