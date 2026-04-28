import { type Injector, runInInjectionContext } from "injection-js";
import type { EngineCapabilities, PretendEngineType } from "../engine/types";
import {
	type GithubWorkflow,
	type WorkflowOverlay,
	type WorkflowOverlayOperation,
	WorkflowOverlayOperationType,
	type WorkflowStep,
} from "../workflows/index";
import { getActionIdFromUses, matchesActionPretender } from "./matcher";
import type {
	ActionPretenderOperationResult,
	ActionPretenderRegistry,
	ActionPretenderResult,
} from "./types";

export type CompileActionPretendersOptions = {
	workflow: GithubWorkflow;
	actions?: ActionPretenderRegistry;
	config?: unknown;
	engine?: PretendEngineType;
	capabilities?: EngineCapabilities;
	injector?: Injector;
};

export async function compileActionPretendersToWorkflowOverlay(
	options: CompileActionPretendersOptions,
): Promise<WorkflowOverlay> {
	const operations: WorkflowOverlayOperation[] = [];
	const actions = Object.entries(options.actions ?? {});
	for (const [jobId, job] of Object.entries(options.workflow.jobs ?? {})) {
		for (const [stepIndex, step] of (job.steps ?? []).entries()) {
			const originalUses = step.uses;
			const actionId = getActionIdFromUses(originalUses);
			const context = {
				workflow: options.workflow,
				jobId,
				job,
				step,
				stepIndex,
				actionId,
				originalUses,
				config: options.config,
				engine: options.engine,
				capabilities: options.capabilities,
				injector: options.injector,
			};

			for (const [, rule] of actions) {
				const matches = runWithInjector(options.injector, () =>
					matchesActionPretender(rule.test, context),
				);
				if (!matches) {
					continue;
				}
				const result = await runWithInjector(options.injector, () =>
					rule.pretender(step, context),
				);
				const operation = actionPretenderResultToOperation(
					jobId,
					stepIndex,
					result,
				);
				if (operation) {
					operations.push(operation);
				}
				break;
			}
		}
	}
	return operations;
}

function runWithInjector<ReturnValue>(
	injector: Injector | undefined,
	callback: () => ReturnValue,
): ReturnValue {
	return injector ? runInInjectionContext(injector, callback) : callback();
}

function actionPretenderResultToOperation(
	jobId: string,
	stepIndex: number,
	result: ActionPretenderResult,
): WorkflowOverlayOperation | undefined {
	if (result === undefined) {
		return undefined;
	}
	if (typeof result === "string" || isWorkflowStep(result)) {
		return {
			type: WorkflowOverlayOperationType.ReplaceStep,
			jobId,
			selector: { index: stepIndex },
			step: result,
		};
	}
	return operationResultToOverlay(jobId, stepIndex, result);
}

function operationResultToOverlay(
	jobId: string,
	stepIndex: number,
	result: ActionPretenderOperationResult,
): WorkflowOverlayOperation | undefined {
	switch (result.operation) {
		case "replace":
			return {
				type: WorkflowOverlayOperationType.ReplaceStep,
				jobId,
				selector: { index: stepIndex },
				step: result.with,
			};
		case "skip":
			return {
				type: WorkflowOverlayOperationType.SkipStep,
				jobId,
				selector: { index: stepIndex },
				condition: result.condition,
				reason: result.reason,
			};
		case "insert-before":
			return {
				type: WorkflowOverlayOperationType.InsertStepBefore,
				jobId,
				selector: { index: stepIndex },
				step: result.step,
			};
		case "insert-after":
			return {
				type: WorkflowOverlayOperationType.InsertStepAfter,
				jobId,
				selector: { index: stepIndex },
				step: result.step,
			};
		case "keep":
			return {
				type: WorkflowOverlayOperationType.KeepStep,
				jobId,
				selector: { index: stepIndex },
			};
	}
}

function isWorkflowStep(value: ActionPretenderResult): value is WorkflowStep {
	return typeof value === "object" && value !== null && !("operation" in value);
}
