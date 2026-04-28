import type { Injector } from "injection-js";

import type { EngineCapabilities, PretendEngineType } from "../engine/types";
import type {
	GithubWorkflow,
	WorkflowJob,
	WorkflowStep,
} from "../workflows/index";

export type ActionPretenderRegistry = Record<string, ActionPretenderConfig>;

export type ActionPretenderConfig = {
	test: ActionPretenderMatcher;
	pretender: ActionPretender;
};

export type ActionPretenderMatcher =
	| ActionPretenderMatchExpression
	| readonly ActionPretenderMatchExpression[];

export type ActionPretenderMatchExpression =
	| string
	| RegExp
	| ((input: ActionPretenderMatchInput) => boolean);

export type ActionPretenderMatchInput = {
	workflow: GithubWorkflow;
	jobId: string;
	job: WorkflowJob;
	step: WorkflowStep;
	stepIndex: number;
	actionId?: string;
	originalUses?: string;
};

export type ActionPretender = (
	step: WorkflowStep,
	context: ActionPretenderContext,
) => ActionPretenderResult | Promise<ActionPretenderResult>;

export type ActionPretenderContext = ActionPretenderMatchInput & {
	config?: unknown;
	engine?: PretendEngineType;
	capabilities?: EngineCapabilities;
	injector?: Injector;
};

export type ActionPretenderResult =
	| WorkflowStep
	| string
	| ActionPretenderOperationResult
	| undefined;

export type ActionPretenderOperationResult =
	| { operation: "replace"; with: WorkflowStep | string }
	| { operation: "skip"; condition?: string; reason?: string }
	| { operation: "insert-before" | "insert-after"; step: WorkflowStep | string }
	| { operation: "keep" };
