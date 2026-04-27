import path from "node:path";

import { ActRunner, withMockGithub } from "pretend-act/github";

const neverCondition = "$" + "{{ false }}";

await withMockGithub(
	{
		workspacePath: process.cwd(),
		repoName: "securitydept",
		ignore: [
			".git",
			"node_modules",
			"target",
			"dist-tsc",
			"temp/actions-cli",
			"docsite/.vitepress/cache",
		],
	},
	async (sandbox) => {
		const workflowFile = ".github/workflows/release.yml";
		const runner = new ActRunner({
			cwd: sandbox.repoPath,
			workflowFile,
		});

		runner.setEnv("SECURITYDEPT_LOCAL_ACTIONS", "true");
		runner.setInput("source_ref", "refs/heads/release");
		runner.setInput("source_sha", "local-sha");
		runner.setInput("publish_npm", "false");
		runner.setInput("publish_crates", "false");
		runner.setInput("publish_docker", "false");

		const result = await runner.runEvent("workflow_dispatch", {
			bind: true,
			logFile: path.join(sandbox.rootPath, "act-release-run.log"),
			mockSteps: {
				"release-plan": [
					{ uses: "actions/checkout@v6", mockWith: { if: neverCondition } },
					{
						uses: "actions/upload-artifact@v7",
						mockWith: { if: neverCondition },
					},
				],
				"npm-release": [
					{ uses: "actions/checkout@v6", mockWith: { if: neverCondition } },
					{
						uses: "actions/upload-artifact@v7",
						mockWith: { if: neverCondition },
					},
				],
			},
		});

		if (!result.success) {
			throw new Error(result.rawLog);
		}
	},
);
