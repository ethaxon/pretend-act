import { describe, expect, it } from "vitest";

import {
	applyWorkflowOverlayToModel,
	type GithubWorkflow,
	WorkflowOverlayOperationType,
} from "./index";

describe("workflow overlay model", () => {
	it("replaces a uses step with a run step and removes conflicting fields", () => {
		const workflow = createWorkflow();

		applyWorkflowOverlayToModel(workflow, [
			{
				type: WorkflowOverlayOperationType.ReplaceStep,
				jobId: "release",
				selector: { uses: "actions/checkout@v6" },
				step: { run: "echo checkout", env: { LOCAL: "true" } },
			},
		]);

		expect(workflow.jobs?.release.steps?.[0]).toMatchObject({
			run: "echo checkout",
			env: { GITHUB_TOKEN: "token", LOCAL: "true" },
		});
		expect(workflow.jobs?.release.steps?.[0]?.uses).toBeUndefined();
	});

	it("skips and inserts steps with stable operation semantics", () => {
		const workflow = createWorkflow();

		applyWorkflowOverlayToModel(workflow, [
			{
				type: WorkflowOverlayOperationType.SkipStep,
				jobId: "release",
				selector: { name: "Publish" },
			},
			{
				type: WorkflowOverlayOperationType.InsertStepBefore,
				jobId: "release",
				selector: { name: "Publish" },
				step: "echo before",
			},
			{
				type: WorkflowOverlayOperationType.InsertStepAfter,
				jobId: "release",
				selector: { name: "Publish" },
				step: { name: "after", run: "echo after" },
			},
		]);

		expect(workflow.jobs?.release.steps).toEqual([
			expect.objectContaining({ uses: "actions/checkout@v6" }),
			{ run: "echo before" },
			expect.objectContaining({ name: "Publish", if: "$" + "{{ false }}" }),
			{ name: "after", run: "echo after" },
		]);
	});
});

function createWorkflow(): GithubWorkflow {
	return {
		jobs: {
			release: {
				steps: [
					{
						uses: "actions/checkout@v6",
						env: { GITHUB_TOKEN: "token" },
					},
					{ name: "Publish", run: "npm publish" },
				],
			},
		},
	};
}
