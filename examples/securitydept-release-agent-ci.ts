import path from "node:path";

import { AgentCiEngine } from "pretend-act/engine";
import { PretendRunner } from "pretend-act/runner";

const workflowFile = ".github/workflows/release.yml";
const runner = new PretendRunner({
	cwd: process.cwd(),
	engine: new AgentCiEngine({
		pauseOnFailure: true,
		quiet: true,
	}),
	workflowFile,
});

const result = await runner.runWorkflow({
	engineOptions: {
		noMatrix: true,
	},
	env: { SECURITYDEPT_LOCAL_ACTIONS: "true" },
	vars: {
		PUBLISH_NPM: "false",
		PUBLISH_CRATES: "false",
		PUBLISH_DOCKER: "false",
	},
	logFile: path.join(process.cwd(), "temp", "agent-ci-release-run.log"),
});

if (!result.success) {
	throw new Error(result.rawLog);
}
