import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
	AgentCiEngine,
	buildAgentCiArgs,
	buildAgentCiEnv,
	readAgentCiRunResultJobs,
	resolveAgentCiBinary,
} from "./agent-ci";

describe("agent-ci engine args", () => {
	it("builds workflow run args with agent-ci options", () => {
		expect(
			buildAgentCiArgs({
				cwd: "/repo",
				workflowFile: ".github/workflows/ci.yml",
				sha: "HEAD",
				maxJobs: 2,
				pauseOnFailure: true,
				quiet: true,
				noMatrix: true,
				githubToken: true,
				commitStatus: true,
				vars: { RELEASE: "false" },
			}),
		).toEqual([
			"run",
			"HEAD",
			"--workflow",
			".github/workflows/ci.yml",
			"--jobs",
			"2",
			"--pause-on-failure",
			"--quiet",
			"--no-matrix",
			"--github-token",
			"--commit-status",
			"--var",
			"RELEASE=false",
		]);
	});

	it("builds all-workflow args", () => {
		expect(
			buildAgentCiArgs({
				cwd: "/repo",
				workflowFile: ".github/workflows",
				all: true,
			}),
		).toEqual(["run", "--all"]);
	});

	it("moves token strings and secrets into env", () => {
		expect(
			buildAgentCiEnv({
				cwd: "/repo",
				workflowFile: ".github/workflows/ci.yml",
				agentCiWorkingDir: "/tmp/agent-ci",
				agentCiStateDir: "/tmp/agent-ci-state",
				env: { DEBUG: "agent-ci:*" },
				githubToken: "ghp_token",
				secrets: { NPM_TOKEN: "npm-token" },
			}),
		).toEqual({
			AGENT_CI_GITHUB_TOKEN: "ghp_token",
			AGENT_CI_STATE_DIR: "/tmp/agent-ci-state",
			AGENT_CI_WORKING_DIR: "/tmp/agent-ci",
			DEBUG: "agent-ci:*",
			NPM_TOKEN: "npm-token",
		});
	});

	it("rejects request fields that agent-ci cannot model yet", () => {
		expect(() =>
			buildAgentCiArgs({
				cwd: "/repo",
				workflowFile: ".github/workflows/ci.yml",
				event: "push",
				job: "test",
			}),
		).toThrow("event, job");
	});

	it("prefers explicit agent-ci binary", () => {
		expect(resolveAgentCiBinary("/bin/agent-ci")).toBe("/bin/agent-ci");
	});

	it("maps agent-ci run-result JSON to jobs", async () => {
		const stateDir = await mkdtemp(path.join(os.tmpdir(), "agent-ci-state-"));
		try {
			const resultDir = path.join(stateDir, "owner", "repo");
			await mkdir(resultDir, { recursive: true });
			await writeFile(
				path.join(resultDir, "main.12345678.json"),
				JSON.stringify({
					schemaVersion: 1,
					jobs: [
						{
							name: "test",
							status: "failed",
							steps: [
								{ name: "Install", status: "passed" },
								{ name: "Test", status: "failed" },
								{ name: "Deploy", status: "skipped" },
							],
						},
					],
				}),
			);

			expect(await readAgentCiRunResultJobs(stateDir)).toEqual([
				{
					name: "test",
					status: "failure",
					steps: [
						{ name: "Install", status: "success" },
						{ name: "Test", status: "failure" },
						{ name: "Deploy", status: "unknown" },
					],
				},
			]);
		} finally {
			await rm(stateDir, { recursive: true, force: true });
		}
	});

	it("explains missing explicit agent-ci binary", async () => {
		const engine = new AgentCiEngine({
			agentCiBinary: "/definitely/missing/agent-ci",
		});

		await expect(
			engine.run({ cwd: "/repo", workflowFile: ".github/workflows/ci.yml" }),
		).rejects.toMatchObject({
			code: "PRETEND_ACT_AGENT_CI_BINARY_MISSING",
			message: expect.stringContaining("agentCiBinary option"),
		});
	});
});
