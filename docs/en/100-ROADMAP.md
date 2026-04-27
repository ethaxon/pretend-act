# Roadmap

Pretend Act starts as a practical replacement for local workflow simulation. The first implementation intentionally records deferred edge capabilities instead of pretending they are supported.

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