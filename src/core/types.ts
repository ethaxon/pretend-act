export type Dict<T = string> = Record<string, T>;

export const RunStatus = {
	Success: "success",
	Failure: "failure",
	Cancelled: "cancelled",
	Unknown: "unknown",
} as const;

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export type CommandSpec = {
	command: string;
	args: string[];
	cwd?: string;
	env?: Dict<string>;
};

export type RunLogEvent = {
	stream: "stdout" | "stderr";
	chunk: string;
};

export type StepResult = {
	name?: string;
	status: RunStatus;
	output?: string;
};

export type JobResult = {
	id?: string;
	name?: string;
	status: RunStatus;
	steps: StepResult[];
};

export type RunResult = {
	command: CommandSpec;
	status: RunStatus;
	success: boolean;
	exitCode: number | null;
	stdout: string;
	stderr: string;
	rawLog: string;
	jobs: JobResult[];
};

export type DisposableResource = Disposable | AsyncDisposable;

export type WorkspaceSandbox = DisposableResource & {
	rootPath: string;
	repoPath: string;
	repoName: string;
	owner: string;
	keepOnFailure: boolean;
};

export type ToolResolution = {
	tool: string;
	source: "explicit" | "environment" | "path";
};
