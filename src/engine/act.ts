import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
	type CommandSpec,
	type Dict,
	type RunResult,
	RunStatus,
	spawnCommand,
} from "../core/index";
import {
	type EngineAdapter,
	type EngineRunRequest,
	FullEngineCapabilities,
	PretendEngineType,
} from "./types";

export type ActEngineOptions = {
	actBinary?: string;
	defaultImage?: string;
	passthroughArgs?: string[];
};

export type ActEngineRunOptions = EngineRunRequest & {
	bind?: boolean;
	verbose?: boolean;
	containerOptions?: string;
	containerArchitecture?: string;
	containerDaemonSocket?: string;
};

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

export class ActEngine implements EngineAdapter {
	readonly type = PretendEngineType.Act;
	readonly capabilities = FullEngineCapabilities;
	private readonly options: ActEngineOptions;

	constructor(options: ActEngineOptions = {}) {
		this.options = options;
	}

	async run(request: ActEngineRunOptions): Promise<RunResult> {
		let eventPath = request.eventPath;
		if (request.eventPayload !== undefined && !eventPath) {
			eventPath = await writeEventPayload(request.eventPayload);
		}

		const args = buildActArgs({
			event: request.event,
			workflowFile: request.workflowFile,
			validate: request.validate,
			dryRun: request.dryRun,
			job: request.job,
			bind: request.bind,
			verbose: request.verbose,
			eventPath,
			inputs: request.inputs,
			env: request.env,
			secrets: request.secrets,
			vars: request.vars,
			platforms: request.platforms,
			matrix: request.matrix,
			containerOptions: request.containerOptions,
			containerArchitecture: request.containerArchitecture,
			containerDaemonSocket: request.containerDaemonSocket,
			artifactServer: request.artifactServer,
			passthroughArgs: [
				...(this.options.passthroughArgs ?? []),
				...(request.passthroughArgs ?? []),
			],
		});

		const command = resolveActBinary(this.options.actBinary);
		const result = await spawnCommand({
			command,
			args,
			cwd: request.cwd,
			logFile: request.logFile,
			onLog: request.onLog,
		});

		return toRunResult(result, command, args, request.cwd);
	}
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
		success: status === RunStatus.Success,
		exitCode: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
		rawLog: result.rawLog,
		jobs: [],
	};
}

function statusFromExitCode(exitCode: number | null): RunStatus {
	if (exitCode === 0) {
		return RunStatus.Success;
	}
	if (exitCode === null) {
		return RunStatus.Unknown;
	}
	return RunStatus.Failure;
}
