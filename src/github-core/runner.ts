import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
	type CommandSpec,
	type Dict,
	type RunResult,
	type RunStatus,
	spawnCommand,
} from "../core/index";
import type { ActRunnerOptions, ActRunOptions } from "./types";
import { applyWorkflowOverlay } from "./workflow-overlay";

export function resolveActBinary(explicitBinary?: string): string {
	return explicitBinary ?? process.env.ACT_BINARY ?? "act";
}

export function buildActArgs(options: {
	event?: string;
	workflowFile: string;
	validate?: boolean;
	dryRun?: boolean;
	job?: string;
	bind?: boolean;
	verbose?: boolean;
	eventPath?: string;
	inputs?: Dict<string>;
	env?: Dict<string>;
	secrets?: Dict<string>;
	vars?: Dict<string>;
	platforms?: Dict<string>;
	matrix?: Dict<string[]>;
	containerOptions?: string;
	containerArchitecture?: string;
	containerDaemonSocket?: string;
	artifactServer?: { path: string; port?: string | number };
	passthroughArgs?: string[];
}): string[] {
	const args: string[] = [];

	if (options.validate) {
		args.push("--validate");
	} else if (options.event) {
		args.push(options.event);
	}

	args.push("-W", options.workflowFile);

	if (options.dryRun) {
		args.push("-n");
	}
	if (options.job) {
		args.push("-j", options.job);
	}
	if (options.bind) {
		args.push("--bind");
	}
	if (options.verbose) {
		args.push("--verbose");
	}
	if (options.eventPath) {
		args.push("--eventpath", options.eventPath);
	}
	if (options.containerOptions) {
		args.push("--container-options", options.containerOptions);
	}
	if (options.containerArchitecture) {
		args.push("--container-architecture", options.containerArchitecture);
	}
	if (options.containerDaemonSocket) {
		args.push("--container-daemon-socket", options.containerDaemonSocket);
	}
	if (options.artifactServer) {
		args.push("--artifact-server-path", options.artifactServer.path);
		if (options.artifactServer.port !== undefined) {
			args.push("--artifact-server-port", String(options.artifactServer.port));
		}
	}

	appendMapArgs(args, "--input", options.inputs);
	appendMapArgs(args, "--env", options.env);
	appendMapArgs(args, "-s", options.secrets);
	appendMapArgs(args, "--var", options.vars);
	appendMapArgs(args, "--platform", options.platforms);
	for (const [key, values] of Object.entries(options.matrix ?? {})) {
		args.push("--matrix", `${key}:${values.join(",")}`);
	}

	args.push(...(options.passthroughArgs ?? []));
	return args;
}

export class ActRunner {
	private cwd: string;
	private workflowFile: string;
	private readonly actBinary?: string;
	private readonly inputs = new Map<string, string>();
	private readonly env = new Map<string, string>();
	private readonly secrets = new Map<string, string>();
	private readonly vars = new Map<string, string>();
	private readonly platforms = new Map<string, string>();
	private readonly matrix = new Map<string, string[]>();
	private containerOptions: string | undefined;
	private containerArchitecture: string | undefined;
	private containerDaemonSocket: string | undefined;

	constructor(options: ActRunnerOptions = {}) {
		this.cwd = options.cwd ?? process.cwd();
		this.workflowFile = options.workflowFile ?? ".github/workflows";
		this.actBinary = options.actBinary;
		if (options.defaultImage) {
			this.platforms.set("ubuntu-latest", options.defaultImage);
		}
	}

	setCwd(cwd: string): this {
		this.cwd = cwd;
		return this;
	}

	setWorkflowFile(workflowFile: string): this {
		this.workflowFile = workflowFile;
		return this;
	}

	setInput(key: string, value: string): this {
		this.inputs.set(key, value);
		return this;
	}

	setEnv(key: string, value: string): this {
		this.env.set(key, value);
		return this;
	}

	setSecret(key: string, value: string): this {
		this.secrets.set(key, value);
		return this;
	}

	setVar(key: string, value: string): this {
		this.vars.set(key, value);
		return this;
	}

	setPlatforms(key: string, value: string): this {
		this.platforms.set(key, value);
		return this;
	}

	setMatrix(key: string, value: string[]): this {
		this.matrix.set(key, value);
		return this;
	}

	setCustomContainerOpts(value: string | undefined): this {
		this.containerOptions = value;
		return this;
	}

	setContainerArchitecture(value: string | undefined): this {
		this.containerArchitecture = value;
		return this;
	}

	setContainerDaemonSocket(value: string | undefined): this {
		this.containerDaemonSocket = value;
		return this;
	}

	async validateWorkflow(options: ActRunOptions = {}): Promise<RunResult> {
		return this.runAct({ ...options, event: undefined, validate: true });
	}

	async dryRunWorkflow(
		event: string,
		options: ActRunOptions = {},
	): Promise<RunResult> {
		return this.runAct({ ...options, event, dryRun: true });
	}

	async runEvent(
		event: string,
		options: ActRunOptions = {},
	): Promise<RunResult> {
		return this.runAct({ ...options, event });
	}

	async runJob(jobId: string, options: ActRunOptions = {}): Promise<RunResult> {
		return this.runAct({ ...options, job: jobId });
	}

	private async runAct(
		options: ActRunOptions & { event?: string; validate?: boolean },
	): Promise<RunResult> {
		const cwd = options.cwd ?? this.cwd;
		const workflowFile = options.workflowFile ?? this.workflowFile;
		let eventPath = options.eventPath;

		if (options.mockSteps) {
			await applyWorkflowOverlay({
				cwd,
				workflowFile,
				mockSteps: options.mockSteps,
			});
		}

		if (options.eventPayload !== undefined && !eventPath) {
			eventPath = await writeEventPayload(options.eventPayload);
		}

		const args = buildActArgs({
			event: options.event,
			workflowFile,
			validate: options.validate,
			dryRun: options.dryRun,
			job: options.job,
			bind: options.bind,
			verbose: options.verbose,
			eventPath,
			inputs: mergeMaps(this.inputs, options.inputs),
			env: mergeMaps(this.env, options.env),
			secrets: mergeMaps(this.secrets, options.secrets),
			vars: mergeMaps(this.vars, options.vars),
			platforms: mergeMaps(this.platforms, options.platforms),
			matrix: mergeArrayMaps(this.matrix, options.matrix),
			containerOptions: options.containerOptions ?? this.containerOptions,
			containerArchitecture:
				options.containerArchitecture ?? this.containerArchitecture,
			containerDaemonSocket:
				options.containerDaemonSocket ?? this.containerDaemonSocket,
			artifactServer: options.artifactServer,
			passthroughArgs: options.passthroughArgs,
		});

		const command = resolveActBinary(this.actBinary);
		const result = await spawnCommand({
			command,
			args,
			cwd,
			logFile: options.logFile,
			onLog: options.onLog,
		});

		return toRunResult(result, command, args, cwd);
	}
}

export async function validateWorkflow(
	options: ActRunnerOptions & ActRunOptions,
): Promise<RunResult> {
	return new ActRunner(options).validateWorkflow(options);
}

export async function dryRunWorkflow(
	event: string,
	options: ActRunnerOptions & ActRunOptions,
): Promise<RunResult> {
	return new ActRunner(options).dryRunWorkflow(event, options);
}

export async function runWorkflow(
	event: string,
	options: ActRunnerOptions & ActRunOptions,
): Promise<RunResult> {
	return new ActRunner(options).runEvent(event, options);
}

export async function runJob(
	jobId: string,
	options: ActRunnerOptions & ActRunOptions,
): Promise<RunResult> {
	return new ActRunner(options).runJob(jobId, options);
}

function appendMapArgs(
	args: string[],
	flag: string,
	values?: Dict<string>,
): void {
	for (const [key, value] of Object.entries(values ?? {})) {
		args.push(flag, `${key}=${value}`);
	}
}

function mergeMaps(
	base: Map<string, string>,
	overrides?: Dict<string>,
): Dict<string> {
	return { ...Object.fromEntries(base), ...(overrides ?? {}) };
}

function mergeArrayMaps(
	base: Map<string, string[]>,
	overrides?: Dict<string[]>,
): Dict<string[]> {
	return { ...Object.fromEntries(base), ...(overrides ?? {}) };
}

async function writeEventPayload(payload: unknown): Promise<string> {
	const directory = await mkdtemp(path.join(os.tmpdir(), "pretend-act-event-"));
	const eventPath = path.join(directory, "event.json");
	await writeFile(eventPath, JSON.stringify(payload, undefined, 2), "utf8");
	return eventPath;
}

function toRunResult(
	result: {
		command: CommandSpec;
		exitCode: number | null;
		stdout: string;
		stderr: string;
		rawLog: string;
	},
	command: string,
	args: string[],
	cwd: string,
): RunResult {
	const status = statusFromExitCode(result.exitCode);
	return {
		command: { command, args, cwd },
		status,
		success: status === "success",
		exitCode: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
		rawLog: result.rawLog,
		jobs: [],
	};
}

function statusFromExitCode(exitCode: number | null): RunStatus {
	if (exitCode === 0) {
		return "success";
	}
	if (exitCode === null) {
		return "unknown";
	}
	return "failure";
}
