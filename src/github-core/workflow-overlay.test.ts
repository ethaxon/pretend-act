import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { applyWorkflowOverlay } from "./workflow-overlay";

describe("workflow overlay", () => {
	it("updates only the sandbox workflow file", async () => {
		const neverCondition = "$" + "{{ false }}";
		const sourceDir = await mkdtemp(
			path.join(os.tmpdir(), "pretend-act-source-"),
		);
		const sandboxDir = await mkdtemp(
			path.join(os.tmpdir(), "pretend-act-sandbox-"),
		);
		const workflowPath = ".github/workflows/release.yml";
		const workflow = `name: Release
on: workflow_dispatch
jobs:
  release-plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
`;
		await mkdir(path.dirname(path.join(sandboxDir, workflowPath)), {
			recursive: true,
		});
		await writeFile(path.join(sourceDir, "release.yml"), workflow, "utf8");
		await writeFile(path.join(sandboxDir, workflowPath), workflow, "utf8");

		await applyWorkflowOverlay({
			cwd: sandboxDir,
			workflowFile: workflowPath,
			mockSteps: {
				"release-plan": [
					{
						uses: "actions/checkout@v6",
						mockWith: { if: neverCondition },
					},
				],
			},
		});

		expect(await readFile(path.join(sourceDir, "release.yml"), "utf8")).toBe(
			workflow,
		);
		expect(
			await readFile(path.join(sandboxDir, workflowPath), "utf8"),
		).toContain(neverCondition);
	});
});
