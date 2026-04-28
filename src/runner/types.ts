import type { Injector } from "injection-js";

import type { ActionPretenderRegistry } from "../actions/index";
import type { EngineAdapter, EngineRunRequest } from "../engine/index";
import type { WorkflowOverlay } from "../workflows/index";

export type PretendRunnerOptions = {
	engine: EngineAdapter;
	cwd: string;
	workflowFile?: string;
	workflowOverlay?: WorkflowOverlay;
	actions?: ActionPretenderRegistry;
	actionConfig?: unknown;
	injector?: Injector;
	engineOptions?: Record<string, unknown>;
};

export type WorkflowRunOptions = Omit<
	EngineRunRequest,
	"cwd" | "workflowFile"
> & {
	cwd?: string;
	workflowFile?: string;
	workflowOverlay?: WorkflowOverlay;
	actions?: ActionPretenderRegistry;
	actionConfig?: unknown;
	injector?: Injector;
	engineOptions?: Record<string, unknown>;
};
