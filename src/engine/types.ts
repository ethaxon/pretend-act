import type { Dict, RunLogEvent, RunResult } from "../core/index";

export const PretendEngineType = {
	Act: "act",
	AgentCi: "agent-ci",
} as const;

export type PretendEngineType =
	(typeof PretendEngineType)[keyof typeof PretendEngineType];

export type EngineAdapter = {
	type: PretendEngineType;
	capabilities?: EngineCapabilities;
	run(request: EngineRunRequest): Promise<RunResult>;
};

export type EngineCapabilities = {
	workflow: boolean;
	event: boolean;
	job: boolean;
	validate: boolean;
	dryRun: boolean;
	eventPath: boolean;
	eventPayload: boolean;
	inputs: boolean;
	env: boolean;
	secrets: boolean;
	vars: boolean;
	platforms: boolean;
	matrix: boolean;
	artifactServer: boolean;
};

export const FullEngineCapabilities: EngineCapabilities = {
	workflow: true,
	event: true,
	job: true,
	validate: true,
	dryRun: true,
	eventPath: true,
	eventPayload: true,
	inputs: true,
	env: true,
	secrets: true,
	vars: true,
	platforms: true,
	matrix: true,
	artifactServer: true,
};

export type EngineRunRequest = {
	cwd: string;
	workflowFile: string;
	event?: string;
	validate?: boolean;
	dryRun?: boolean;
	job?: string;
	logFile?: string;
	eventPath?: string;
	eventPayload?: unknown;
	inputs?: Dict<string>;
	env?: Dict<string>;
	secrets?: Dict<string>;
	vars?: Dict<string>;
	platforms?: Dict<string>;
	matrix?: Dict<string[]>;
	artifactServer?: {
		path: string;
		port?: string | number;
	};
	passthroughArgs?: string[];
	onLog?: (event: RunLogEvent) => void;
};
