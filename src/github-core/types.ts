import type {
	Dict,
	FileSystemBackend,
	RunLogEvent,
	WorkspaceFilterOptions,
} from "../core/index";

export type ActRunnerOptions = {
	cwd?: string;
	workflowFile?: string;
	actBinary?: string;
	defaultImage?: string;
};

export type ActRunOptions = {
	cwd?: string;
	workflowFile?: string;
	bind?: boolean;
	dryRun?: boolean;
	verbose?: boolean;
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
	containerOptions?: string;
	containerArchitecture?: string;
	containerDaemonSocket?: string;
	artifactServer?: {
		path: string;
		port?: string | number;
	};
	mockSteps?: MockSteps;
	passthroughArgs?: string[];
	onLog?: (event: RunLogEvent) => void;
};

export type MockSteps = Record<string, MockStep[]>;

export type MockStep = StepSelector & {
	mockWith: WorkflowStep | string;
};

export type StepSelector =
	| { id: string }
	| { name: string }
	| { uses: string }
	| { run: string }
	| { index: number }
	| { before: string | number }
	| { after: string | number };

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

export type GithubSandboxOptions = {
	workspacePath: string;
	setupPath?: string;
	tempRootPath?: string;
	repoName?: string;
	owner?: string;
	defaultBranch?: string;
	ref?: string;
	sha?: string;
	ignore?: string[];
	workspaceFilter?: WorkspaceFilterOptions;
	fsBackend?: "real" | "memory" | "overlay" | FileSystemBackend;
	materialize?: "always" | "before-child-process" | "never";
	keepOnFailure?: boolean;
	initializeGit?: boolean;
	files?: { src: string; dest?: string }[];
};

export type GithubSandbox = {
	rootPath: string;
	repoPath: string;
	repoName: string;
	owner: string;
	keepOnFailure: boolean;
	materialized: boolean;
	backend?: FileSystemBackend;
	getPath(repositoryName?: string): string | undefined;
	materialize(): Promise<string>;
	cleanup(options?: { failed?: boolean }): Promise<void>;
	dispose(): Promise<void>;
};
