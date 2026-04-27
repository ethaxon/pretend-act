import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { importOptionalPeer, PretendActError } from "../core/index";
import type {
	GithubWorkflow,
	MockStep,
	MockSteps,
	WorkflowStep,
} from "./types";

type YamlModule = {
	parse(source: string): unknown;
	stringify(value: unknown): string;
};

export type ApplyWorkflowOverlayOptions = {
	cwd: string;
	workflowFile: string;
	mockSteps: MockSteps;
};

export async function applyWorkflowOverlay(
	options: ApplyWorkflowOverlayOptions,
): Promise<void> {
	const yaml = await importOptionalPeer<YamlModule>("yaml", "workflow overlay");
	const workflowPath = resolveWorkflowPath(options.cwd, options.workflowFile);
	const workflow = yaml.parse(
		await readFile(workflowPath, "utf8"),
	) as GithubWorkflow;

	for (const [jobId, steps] of Object.entries(options.mockSteps)) {
		applyJobOverlay(workflow, jobId, steps);
	}

	await writeFile(workflowPath, yaml.stringify(workflow), "utf8");
}

export function applyJobOverlay(
	workflow: GithubWorkflow,
	jobId: string,
	mockSteps: MockStep[],
): void {
	const job = workflow.jobs?.[jobId];
	if (!job?.steps) {
		throw new PretendActError(`Could not find job '${jobId}' in workflow.`, {
			code: "PRETEND_ACT_WORKFLOW_JOB_NOT_FOUND",
		});
	}

	const pendingInserts: {
		index: number;
		after: boolean;
		step: WorkflowStep;
	}[] = [];
	for (const mockStep of mockSteps) {
		const stepIndex = locateStep(job.steps, mockStep);
		if (stepIndex < 0) {
			throw new PretendActError(`Could not find step in job '${jobId}'.`, {
				code: "PRETEND_ACT_WORKFLOW_STEP_NOT_FOUND",
			});
		}

		if ("before" in mockStep || "after" in mockStep) {
			pendingInserts.push({
				index: stepIndex,
				after: "after" in mockStep,
				step: normalizeMockStep(mockStep, job.steps[stepIndex]),
			});
		} else {
			job.steps[stepIndex] = normalizeMockStep(mockStep, job.steps[stepIndex]);
		}
	}

	for (const insert of pendingInserts.sort(
		(left, right) => right.index - left.index,
	)) {
		job.steps.splice(
			insert.after ? insert.index + 1 : insert.index,
			0,
			insert.step,
		);
	}
}

function resolveWorkflowPath(cwd: string, workflowFile: string): string {
	if (path.isAbsolute(workflowFile)) {
		return workflowFile;
	}
	return path.resolve(cwd, workflowFile);
}

function normalizeMockStep(
	mockStep: MockStep,
	oldStep: WorkflowStep,
): WorkflowStep {
	if (typeof mockStep.mockWith === "string") {
		const { uses: _uses, ...rest } = oldStep;
		return { ...rest, run: mockStep.mockWith };
	}

	return {
		...oldStep,
		...mockStep.mockWith,
		env: mergeObject(oldStep.env, mockStep.mockWith.env),
		with: mergeObject(oldStep.with, mockStep.mockWith.with),
	};
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

function locateStep(steps: WorkflowStep[], mockStep: MockStep): number {
	return steps.findIndex((step, index) => {
		if ("id" in mockStep) {
			return step.id === mockStep.id;
		}
		if ("name" in mockStep) {
			return step.name === mockStep.name;
		}
		if ("uses" in mockStep) {
			return step.uses === mockStep.uses;
		}
		if ("run" in mockStep) {
			return step.run === mockStep.run;
		}
		if ("index" in mockStep) {
			return index === mockStep.index;
		}
		if ("before" in mockStep) {
			return matchesBeforeAfter(step, index, mockStep.before);
		}
		if ("after" in mockStep) {
			return matchesBeforeAfter(step, index, mockStep.after);
		}
		return false;
	});
}

function matchesBeforeAfter(
	step: WorkflowStep,
	index: number,
	selector: string | number,
): boolean {
	if (typeof selector === "number") {
		return index === selector;
	}
	return [step.id, step.name, step.uses, step.run].includes(selector);
}
