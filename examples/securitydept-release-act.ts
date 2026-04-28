import path from "node:path";

import { createCheckoutPretender } from "pretend-act/actions";
import { ActEngine } from "pretend-act/engine";
import {
	createGithubActionsContainer,
	GithubActionsWorkspaceToken,
} from "pretend-act/github";
import { PretendRunner } from "pretend-act/runner";

const skipAction = () => ({ operation: "skip" }) as const;

await using container = await createGithubActionsContainer({
	repository: {
		name: "securitydept",
		source: {
			path: process.cwd(),
			ignore: [
				".git",
				"node_modules",
				"target",
				"dist-tsc",
				"temp/actions-cli",
				"docsite/.vitepress/cache",
			],
		},
	},
});
const workspace = container.require(GithubActionsWorkspaceToken);
const workflowFile = ".github/workflows/release.yml";
const runner = new PretendRunner({
	cwd: workspace.repoPath,
	engine: new ActEngine(),
	injector: container.injector,
	workflowFile,
	actions: {
		checkout: createCheckoutPretender(),
		artifact: {
			test: "actions/upload-artifact",
			pretender: skipAction,
		},
	},
});

const result = await runner.runEvent("workflow_dispatch", {
	engineOptions: { bind: true },
	env: { SECURITYDEPT_LOCAL_ACTIONS: "true" },
	inputs: {
		source_ref: "refs/heads/release",
		source_sha: "local-sha",
		publish_npm: "false",
		publish_crates: "false",
		publish_docker: "false",
	},
	logFile: path.join(workspace.rootPath, "act-release-run.log"),
});

if (!result.success) {
	throw new Error(result.rawLog);
}
