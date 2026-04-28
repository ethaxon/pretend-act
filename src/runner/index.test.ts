import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { type RunResult, RunStatus } from "../core/index";
import { AgentCiEngine } from "../engine/agent-ci";
import {
	type EngineAdapter,
	type EngineRunRequest,
	FullEngineCapabilities,
	PretendEngineType,
} from "../engine/index";
import { WorkflowOverlayOperationType } from "../workflows/index";
import { PretendRunner } from "./index";

describe("pretend runner", () => {
	it("stages workflow overlays before calling the engine", async () => {
		const cwd = await mkdtemp(path.join(os.tmpdir(), "pretend-act-runner-"));
		const workflowFile = ".github/workflows/release.yml";
		await mkdir(path.dirname(path.join(cwd, workflowFile)), {
			recursive: true,
		});
		await writeFile(
			path.join(cwd, workflowFile),
			`name: Release
on: workflow_dispatch
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
`,
			"utf8",
		);
		const engine = new RecordingEngine();

		const result = await new PretendRunner({
			engine,
			cwd,
			workflowFile,
			workflowOverlay: [
				{
					type: WorkflowOverlayOperationType.ReplaceStep,
					jobId: "release",
					selector: { uses: "actions/checkout@v6" },
					step: "echo checkout",
				},
			],
		}).runEvent("workflow_dispatch", {
			inputs: { publish: "false" },
		});

		expect(result.success).toBe(true);
		expect(engine.requests).toEqual([
			expect.objectContaining({
				cwd,
				workflowFile: expect.stringContaining(".pretend-act-workflow-"),
				event: "workflow_dispatch",
				inputs: { publish: "false" },
			}),
		]);
		expect(await readFile(path.join(cwd, workflowFile), "utf8")).toBe(
			`name: Release
on: workflow_dispatch
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
`,
		);
		expect(engine.workflowContents).toContain("echo checkout");
	});

	it("fails before staging when the engine cannot support the request shape", async () => {
		const cwd = await mkdtemp(path.join(os.tmpdir(), "pretend-act-runner-"));
		const workflowFile = ".github/workflows/release.yml";
		await mkdir(path.dirname(path.join(cwd, workflowFile)), {
			recursive: true,
		});
		await writeFile(
			path.join(cwd, workflowFile),
			`name: Release
on: workflow_dispatch
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - run: echo release
`,
			"utf8",
		);

		await expect(
			new PretendRunner({
				engine: new AgentCiEngine(),
				cwd,
				workflowFile,
			}).runEvent("workflow_dispatch"),
		).rejects.toThrow("agent-ci engine does not support: event");
	});
});

class RecordingEngine implements EngineAdapter {
	readonly type = PretendEngineType.Act;
	readonly capabilities = FullEngineCapabilities;
	readonly requests: EngineRunRequest[] = [];
	workflowContents = "";

	async run(request: EngineRunRequest): Promise<RunResult> {
		this.requests.push(request);
		this.workflowContents = await readFile(
			path.resolve(request.cwd, request.workflowFile),
			"utf8",
		);
		return {
			command: { command: "fake-engine", args: [], cwd: request.cwd },
			status: RunStatus.Success,
			success: true,
			exitCode: 0,
			stdout: "",
			stderr: "",
			rawLog: "",
			jobs: [],
		};
	}
}
