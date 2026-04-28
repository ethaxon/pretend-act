import { InjectionToken, inject, ReflectiveInjector } from "injection-js";
import { describe, expect, it } from "vitest";
import { GithubCheckoutBackendToken } from "../github-core/tokens";
import {
	type GithubWorkflow,
	WorkflowOverlayOperationType,
} from "../workflows/index";
import { compileActionPretendersToWorkflowOverlay } from "./index";

describe("action pretender compiler", () => {
	const ScriptToken = new InjectionToken<string>("script");

	it("compiles the first matching action rule into overlay operations", async () => {
		const workflow = createWorkflow();

		await expect(
			compileActionPretendersToWorkflowOverlay({
				workflow,
				actions: {
					checkout: {
						test: "actions/checkout",
						pretender: () => ({ operation: "replace", with: "echo checkout" }),
					},
					publish: {
						test: ({ step }) => step.run === "npm publish",
						pretender: async (_step, context) => ({
							operation: "skip",
							reason: context.jobId,
						}),
					},
				},
			}),
		).resolves.toEqual([
			{
				type: WorkflowOverlayOperationType.ReplaceStep,
				jobId: "release",
				selector: { index: 0 },
				step: "echo checkout",
			},
			{
				type: WorkflowOverlayOperationType.SkipStep,
				jobId: "release",
				selector: { index: 1 },
				condition: undefined,
				reason: "release",
			},
		]);
	});

	it("uses checkout backend pretender as an action rule", async () => {
		const workflow = createWorkflow();
		const { createCheckoutPretender } = await import("./index");
		const checkout = {
			checkoutSha: "abc123",
			fetchRef: "refs/heads/main",
			remoteUrl: "file:///repo.git",
		};
		const injector = ReflectiveInjector.resolveAndCreate([
			{ provide: GithubCheckoutBackendToken, useValue: checkout },
		]);

		await expect(
			compileActionPretendersToWorkflowOverlay({
				workflow,
				injector,
				actions: {
					checkout: createCheckoutPretender(),
				},
			}),
		).resolves.toEqual([
			{
				type: WorkflowOverlayOperationType.ReplaceStep,
				jobId: "release",
				selector: { index: 0 },
				step: expect.objectContaining({
					run: expect.stringContaining("git fetch --no-tags --prune origin"),
				}),
			},
		]);
	});

	it("runs custom pretenders inside the injector context", async () => {
		const workflow = createWorkflow();
		const injector = ReflectiveInjector.resolveAndCreate([
			{ provide: ScriptToken, useValue: "echo injected" },
		]);

		await expect(
			compileActionPretendersToWorkflowOverlay({
				workflow,
				injector,
				actions: {
					checkout: {
						test: "actions/checkout",
						pretender: () => ({
							operation: "replace",
							with: inject(ScriptToken),
						}),
					},
				},
			}),
		).resolves.toEqual([
			{
				type: WorkflowOverlayOperationType.ReplaceStep,
				jobId: "release",
				selector: { index: 0 },
				step: "echo injected",
			},
		]);
	});
});

function createWorkflow(): GithubWorkflow {
	return {
		jobs: {
			release: {
				steps: [
					{ uses: "actions/checkout@v6", with: { clean: false } },
					{ run: "npm publish" },
				],
			},
		},
	};
}
