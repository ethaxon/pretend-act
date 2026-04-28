import type { Dict } from "../core/index";

export type WorkflowStep = {
	id?: string;
	name?: string;
	uses?: string;
	run?: string;
	if?: string;
	with?: Dict<unknown>;
	env?: Dict<unknown>;
	[key: string]: unknown;
};

export type WorkflowJob = {
	name?: string;
	steps?: WorkflowStep[];
	[key: string]: unknown;
};

export type GithubWorkflow = {
	name?: string;
	on?: unknown;
	jobs?: Record<string, WorkflowJob>;
	[key: string]: unknown;
};

export type WorkflowStepSelector =
	| { id: string }
	| { name: string }
	| { uses: string }
	| { run: string }
	| { index: number };

export const WorkflowOverlayOperationType = {
	ReplaceStep: "replace-step",
	SkipStep: "skip-step",
	InsertStepBefore: "insert-step-before",
	InsertStepAfter: "insert-step-after",
	KeepStep: "keep-step",
} as const;

export type WorkflowOverlayOperationType =
	(typeof WorkflowOverlayOperationType)[keyof typeof WorkflowOverlayOperationType];

export type WorkflowOverlayOperation =
	| WorkflowReplaceStepOperation
	| WorkflowSkipStepOperation
	| WorkflowInsertStepOperation
	| WorkflowKeepStepOperation;

export type WorkflowOverlay = readonly WorkflowOverlayOperation[];

export type WorkflowReplaceStepOperation = {
	type: typeof WorkflowOverlayOperationType.ReplaceStep;
	jobId: string;
	selector: WorkflowStepSelector;
	step: WorkflowStep | string;
};

export type WorkflowSkipStepOperation = {
	type: typeof WorkflowOverlayOperationType.SkipStep;
	jobId: string;
	selector: WorkflowStepSelector;
	condition?: string;
	reason?: string;
};

export type WorkflowInsertStepOperation = {
	type:
		| typeof WorkflowOverlayOperationType.InsertStepBefore
		| typeof WorkflowOverlayOperationType.InsertStepAfter;
	jobId: string;
	selector: WorkflowStepSelector;
	step: WorkflowStep | string;
};

export type WorkflowKeepStepOperation = {
	type: typeof WorkflowOverlayOperationType.KeepStep;
	jobId: string;
	selector: WorkflowStepSelector;
};
