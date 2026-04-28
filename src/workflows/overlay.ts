import { PretendActError } from "../core/index";
import type {
	GithubWorkflow,
	WorkflowInsertStepOperation,
	WorkflowJob,
	WorkflowOverlay,
	WorkflowOverlayOperation,
	WorkflowStep,
	WorkflowStepSelector,
} from "./types";
import { WorkflowOverlayOperationType } from "./types";

const skipCondition = "$" + "{{ false }}";

export function applyWorkflowOverlayToModel(
	workflow: GithubWorkflow,
	overlay: WorkflowOverlay,
): GithubWorkflow {
	for (const operation of overlay) {
		applyWorkflowOverlayOperation(workflow, operation);
	}
	return workflow;
}

export function applyWorkflowOverlayOperation(
	workflow: GithubWorkflow,
	operation: WorkflowOverlayOperation,
): void {
	const job = workflow.jobs?.[operation.jobId];
	if (!job?.steps) {
		throw new PretendActError(
			`Could not find job '${operation.jobId}' in workflow.`,
			{ code: "PRETEND_ACT_WORKFLOW_JOB_NOT_FOUND" },
		);
	}

	const stepIndex = locateStep(job.steps, operation.selector);
	if (stepIndex < 0) {
		throw new PretendActError(
			`Could not find step in job '${operation.jobId}'.`,
			{ code: "PRETEND_ACT_WORKFLOW_STEP_NOT_FOUND" },
		);
	}

	switch (operation.type) {
		case WorkflowOverlayOperationType.ReplaceStep:
			job.steps[stepIndex] = normalizeReplacementStep(
				operation.step,
				job.steps[stepIndex],
			);
			break;
		case WorkflowOverlayOperationType.SkipStep:
			job.steps[stepIndex] = {
				...job.steps[stepIndex],
				if: operation.condition ?? skipCondition,
			};
			break;
		case WorkflowOverlayOperationType.InsertStepBefore:
			insertStep(job, operation, stepIndex);
			break;
		case WorkflowOverlayOperationType.InsertStepAfter:
			insertStep(job, operation, stepIndex + 1);
			break;
		case WorkflowOverlayOperationType.KeepStep:
			break;
	}
}

export function locateStep(
	steps: readonly WorkflowStep[],
	selector: WorkflowStepSelector,
): number {
	return steps.findIndex((step, index) => {
		if ("id" in selector) {
			return step.id === selector.id;
		}
		if ("name" in selector) {
			return step.name === selector.name;
		}
		if ("uses" in selector) {
			return step.uses === selector.uses;
		}
		if ("run" in selector) {
			return step.run === selector.run;
		}
		if ("index" in selector) {
			return index === selector.index;
		}
		return false;
	});
}

function insertStep(
	job: WorkflowJob,
	operation: WorkflowInsertStepOperation,
	index: number,
): void {
	job.steps?.splice(index, 0, normalizeInsertedStep(operation.step));
}

function normalizeReplacementStep(
	step: WorkflowStep | string,
	oldStep: WorkflowStep,
): WorkflowStep {
	if (typeof step === "string") {
		const { uses: _uses, ...rest } = oldStep;
		return { ...rest, run: step };
	}

	const merged = {
		...oldStep,
		...step,
		env: mergeObject(oldStep.env, step.env),
		with: mergeObject(oldStep.with, step.with),
	};
	if ("run" in step) {
		delete merged.uses;
	}
	if ("uses" in step) {
		delete merged.run;
	}
	return merged;
}

function normalizeInsertedStep(step: WorkflowStep | string): WorkflowStep {
	return typeof step === "string" ? { run: step } : { ...step };
}

function mergeObject(
	left: Record<string, unknown> | undefined,
	right: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!left && !right) {
		return undefined;
	}
	return { ...(left ?? {}), ...(right ?? {}) };
}
