# Overview

Pretend Act is a local workflow simulation toolkit for projects that need more than a shell command around `act`. It provides a programmatic runner, a disposable mock repository, workflow overlays, artifact helpers, and registry configuration helpers that can be reused across release automation projects.

The first implementation is intentionally practical. It aims to replace the common `@kie/act-js` plus `@kie/mock-github` stack used to test release workflows locally, including the SecurityDept release workflow simulation pattern.

## Goals

- Run, validate, and dry-run GitHub Actions workflows through `nektos/act`.
- Stage a temporary repository without copying heavy build outputs.
- Apply local-only workflow overlays without editing source workflows.
- Pass workflow dispatch inputs, environment values, variables, and secrets.
- Capture raw logs and return structured run results.
- Keep cleanup deterministic, with an opt-in keep-on-failure mode.
- Provide artifact, npm registry, crates registry, and GitHub context helpers for release workflows.
- Simulate `actions/checkout` through a filtered Git registry snapshot by default, without requiring a host `git` binary, with optional HTTP transport for container boundaries.

## Capability Matrix

| Capability | First wave | Notes |
| --- | --- | --- |
| act binary resolution | Yes | `ACT_BINARY`, explicit path, then `act`. |
| workflow validate | Yes | Wrapper for `act --validate -W`. |
| workflow dry-run | Yes | Wrapper for `act <event> -n -W`. |
| workflow run | Yes | Event and job filters. |
| workflow dispatch inputs | Yes | Event payload and `--input` flags. |
| env/secrets/vars | Yes | Isolated runner state. |
| custom container options | Yes | Includes SecurityDept host UID/GID use case. |
| workflow overlay | Yes | Skip, replace, insert step in sandbox only. |
| git registry checkout | Yes | Dirty workspaces use filtered snapshot commits; explicit commit/tag/clean branch refs publish directly; local file and optional HTTP transports are supported. |
| MockGithub-like repository | Yes | Temporary staged repo plus cleanup. |
| raw log capture | Yes | stdout/stderr and optional log file. |
| step-level parser | Partial | Unknown when not reliable. Raw log and exit code remain authoritative. |
| artifact service protocol parity | Partial | Local store first; protocol parity is roadmap. |
| npm/crates registry server | Yes | Verdaccio lifecycle plus Cargo sparse registry core Web API mock. |
| Docker registry | Partial | Local OCI Distribution lifecycle helper first. |
| remote-mock publish mode | Partial | Service orchestration exists; full SecurityDept migration is next. |

## Non-Goals

Pretend Act is not a full GitHub Actions interpreter. `nektos/act` remains the runner backend for workflow execution. Pretend Act owns the programmatic surface, local sandbox, overlays, structured result model, and reusable test utilities around it.

## Service Backends

Pretend Act prefers mature backends at the right layer. npm publishing should run against Verdaccio. Docker publishing should run against the official OCI Distribution registry. GitHub API helpers should use Octokit only inside the GitHub registry module. Cargo publishing uses a focused sparse registry mock because the npm ecosystem does not currently provide a mature Cargo registry server. The mock covers the core Cargo Web API: publish, yank, unyank, owners, search, sparse index files, metadata, and downloads.

[English](000-OVERVIEW.md) | [中文](../zh/000-OVERVIEW.md)