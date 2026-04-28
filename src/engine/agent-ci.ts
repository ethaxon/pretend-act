import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import {
	type CommandSpec,
	createDisposableTempDirectory,
	type Dict,
	type DisposableTempDirectory,
	type JobResult,
	PretendActError,
	type RunResult,
	RunStatus,
	type StepResult,
	spawnCommand,
} from "../core/index";
import {
	type EngineAdapter,
	type EngineCapabilities,
	type EngineRunRequest,
	PretendEngineType,
} from "./types";

export const AgentCiEngineCapabilities: EngineCapabilities = {
	workflow: true,
	event: false,
	job: false,
	validate: false,
	dryRun: false,
	eventPath: false,
	eventPayload: false,
	inputs: false,
	env: true,
	secrets: true,
	vars: true,
	platforms: false,
	matrix: false,
	artifactServer: false,
};

export type AgentCiGithubToken = boolean | string;

export type AgentCiEngineOptions = {
	agentCiBinary?: string;
	agentCiStateDir?: string;
	all?: boolean;
	pauseOnFailure?: boolean;
	quiet?: boolean;
	noMatrix?: boolean;
	maxJobs?: number;
	githubToken?: AgentCiGithubToken;
	commitStatus?: boolean;
	agentCiWorkingDir?: string;
	passthroughArgs?: string[];
};

export type AgentCiEngineRunOptions = EngineRunRequest &
	AgentCiEngineOptions & {
		sha?: string;
	};

export type AgentCiBinaryResolution = {
	command: string;
	source: "explicit" | "environment" | "optional-peer" | "path";
};

type AgentCiRunResultFile = {
	schemaVersion: number;
	jobs: AgentCiRunResultJobEntry[];
};

type AgentCiRunResultJobEntry = {
	name?: string;
	status?: "passed" | "failed";
	steps?: AgentCiRunResultStepEntry[];
};

type AgentCiRunResultStepEntry = {
	name?: string;
	status?: "passed" | "failed" | "skipped";
};

const require = createRequire(import.meta.url);

export function resolveAgentCiBinary(explicitBinary?: string): string {
	return resolveAgentCiBinarySpec(explicitBinary).command;
}

export function resolveAgentCiBinarySpec(
	explicitBinary?: string,
): AgentCiBinaryResolution {
	if (explicitBinary) {
		return { command: explicitBinary, source: "explicit" };
	}
	if (process.env.AGENT_CI_BINARY) {
		return { command: process.env.AGENT_CI_BINARY, source: "environment" };
	}
	const optionalPeerBinary = resolveAgentCiOptionalPeerBinary();
	if (optionalPeerBinary) {
		return { command: optionalPeerBinary, source: "optional-peer" };
	}
	return { command: "agent-ci", source: "path" };
}

export function buildAgentCiArgs(options: AgentCiEngineRunOptions): string[] {
	assertAgentCiSupportedRequest(options);

	const args = ["run"];
	if (options.sha) {
		args.push(options.sha);
	}
	if (options.all) {
		args.push("--all");
	} else {
		args.push("--workflow", options.workflowFile);
	}
	if (options.maxJobs !== undefined) {
		args.push("--jobs", String(options.maxJobs));
	}
	if (options.pauseOnFailure) {
		args.push("--pause-on-failure");
	}
	if (options.quiet) {
		args.push("--quiet");
	}
	if (options.noMatrix) {
		args.push("--no-matrix");
	}
	if (options.githubToken === true) {
		args.push("--github-token");
	}
	if (options.commitStatus) {
		args.push("--commit-status");
	}
	appendMapArgs(args, "--var", options.vars);
	args.push(...(options.passthroughArgs ?? []));
	return args;
}

export function buildAgentCiEnv(
	options: AgentCiEngineRunOptions,
): Dict<string> | undefined {
	const env: Dict<string> = {
		...(options.env ?? {}),
		...(options.secrets ?? {}),
	};
	if (typeof options.githubToken === "string") {
		env.AGENT_CI_GITHUB_TOKEN = options.githubToken;
	}
	if (options.agentCiWorkingDir) {
		env.AGENT_CI_WORKING_DIR = options.agentCiWorkingDir;
	}
	if (options.agentCiStateDir) {
		env.AGENT_CI_STATE_DIR = options.agentCiStateDir;
	}
	return Object.keys(env).length > 0 ? env : undefined;
}

export class AgentCiEngine implements EngineAdapter {
	readonly type = PretendEngineType.AgentCi;
	readonly capabilities = AgentCiEngineCapabilities;
	private readonly options: AgentCiEngineOptions;

	constructor(options: AgentCiEngineOptions = {}) {
		this.options = options;
	}

	async run(request: AgentCiEngineRunOptions): Promise<RunResult> {
		const merged = mergeOptions(this.options, request);
		const binary = resolveAgentCiBinarySpec(merged.agentCiBinary);
		const args = buildAgentCiArgs(merged);
		const stateDirectory = await prepareAgentCiStateDirectory(merged);
		const runStartedAtMs = Date.now();
		try {
			const result = await spawnCommand({
				command: binary.command,
				args,
				cwd: merged.cwd,
				env: buildAgentCiEnv({
					...merged,
					agentCiStateDir: stateDirectory.path,
				}),
				logFile: merged.logFile,
				onLog: merged.onLog,
			});
			const jobs = await readAgentCiRunResultJobs(
				stateDirectory.path,
				runStartedAtMs,
			);

			return toRunResult(result, binary.command, args, merged.cwd, jobs);
		} catch (error: unknown) {
			throw toAgentCiRunError(error, binary);
		} finally {
			await stateDirectory.dispose?.();
		}
	}
}

export async function readAgentCiRunResultJobs(
	stateDir: string,
	sinceMs = 0,
): Promise<JobResult[]> {
	const resultPath = await findLatestAgentCiRunResult(stateDir, sinceMs);
	if (!resultPath) {
		return [];
	}
	try {
		const parsed = JSON.parse(await readFile(resultPath, "utf8")) as unknown;
		const runResult = parseAgentCiRunResultFile(parsed);
		return runResult?.jobs.map(agentCiJobToRunJob) ?? [];
	} catch {
		return [];
	}
}

function mergeOptions(
	defaults: AgentCiEngineOptions,
	request: AgentCiEngineRunOptions,
): AgentCiEngineRunOptions {
	return {
		...defaults,
		...request,
		passthroughArgs: [
			...(defaults.passthroughArgs ?? []),
			...(request.passthroughArgs ?? []),
		],
	};
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

function assertAgentCiSupportedRequest(options: EngineRunRequest): void {
	const unsupported: string[] = [];
	if (options.event) unsupported.push("event");
	if (options.validate) unsupported.push("validate");
	if (options.dryRun) unsupported.push("dryRun");
	if (options.job) unsupported.push("job");
	if (options.eventPath) unsupported.push("eventPath");
	if (options.eventPayload !== undefined) unsupported.push("eventPayload");
	if (options.inputs) unsupported.push("inputs");
	if (options.platforms) unsupported.push("platforms");
	if (options.matrix) unsupported.push("matrix");
	if (options.artifactServer) unsupported.push("artifactServer");

	if (unsupported.length > 0) {
		throw new PretendActError(
			`agent-ci engine does not support these request fields yet: ${unsupported.join(", ")}.`,
			{ code: "PRETEND_ACT_UNSUPPORTED_ENGINE_OPTION" },
		);
	}
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
	jobs: JobResult[],
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
		jobs,
	};
}

function resolveAgentCiOptionalPeerBinary(): string | undefined {
	try {
		const packageJsonPath = require.resolve("@redwoodjs/agent-ci/package.json");
		const packageRoot = path.dirname(packageJsonPath);
		const packageJson = require(packageJsonPath) as {
			bin?: string | Record<string, string>;
		};
		const bin =
			typeof packageJson.bin === "string"
				? packageJson.bin
				: packageJson.bin?.["agent-ci"];
		return bin ? path.join(packageRoot, bin) : undefined;
	} catch {
		return undefined;
	}
}

async function prepareAgentCiStateDirectory(
	options: AgentCiEngineRunOptions,
): Promise<{ path: string; dispose?: () => Promise<void> }> {
	const explicitStateDir =
		options.agentCiStateDir ??
		options.env?.AGENT_CI_STATE_DIR ??
		process.env.AGENT_CI_STATE_DIR;
	if (explicitStateDir) {
		return { path: explicitStateDir };
	}
	const tempDirectory = await createDisposableTempDirectory(
		"pretend-act-agent-ci-state-",
	);
	return {
		path: tempDirectory.path,
		dispose: () => disposeTempDirectory(tempDirectory),
	};
}

async function disposeTempDirectory(
	tempDirectory: DisposableTempDirectory,
): Promise<void> {
	await tempDirectory[Symbol.asyncDispose]();
}

async function findLatestAgentCiRunResult(
	stateDir: string,
	sinceMs: number,
): Promise<string | undefined> {
	const candidates: { path: string; mtimeMs: number }[] = [];
	await collectJsonFiles(stateDir, candidates);
	candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
	for (const candidate of candidates) {
		if (candidate.mtimeMs + 1000 < sinceMs) {
			continue;
		}
		try {
			const parsed = JSON.parse(
				await readFile(candidate.path, "utf8"),
			) as unknown;
			if (parseAgentCiRunResultFile(parsed)) {
				return candidate.path;
			}
		} catch {}
	}
	return undefined;
}

async function collectJsonFiles(
	directory: string,
	candidates: { path: string; mtimeMs: number }[],
): Promise<void> {
	let entries: Dirent<string>[];
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			await collectJsonFiles(entryPath, candidates);
			continue;
		}
		if (!entry.isFile() || !entry.name.endsWith(".json")) {
			continue;
		}
		try {
			const entryStat = await stat(entryPath);
			candidates.push({ path: entryPath, mtimeMs: entryStat.mtimeMs });
		} catch {}
	}
}

function parseAgentCiRunResultFile(
	value: unknown,
): AgentCiRunResultFile | undefined {
	if (
		!isRecord(value) ||
		value.schemaVersion !== 1 ||
		!Array.isArray(value.jobs)
	) {
		return undefined;
	}
	const jobs = value.jobs.flatMap((job) => {
		const parsed = parseAgentCiRunResultJob(job);
		return parsed ? [parsed] : [];
	});
	return { schemaVersion: 1, jobs };
}

function parseAgentCiRunResultJob(
	value: unknown,
): AgentCiRunResultJobEntry | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const status =
		value.status === "passed" || value.status === "failed"
			? value.status
			: undefined;
	if (!status) {
		return undefined;
	}
	const steps = Array.isArray(value.steps)
		? value.steps.flatMap((step) => {
				const parsed = parseAgentCiRunResultStep(step);
				return parsed ? [parsed] : [];
			})
		: [];
	return {
		name: typeof value.name === "string" ? value.name : undefined,
		status,
		steps,
	};
}

function parseAgentCiRunResultStep(
	value: unknown,
): AgentCiRunResultStepEntry | undefined {
	if (!isRecord(value) || typeof value.name !== "string") {
		return undefined;
	}
	if (
		value.status !== "passed" &&
		value.status !== "failed" &&
		value.status !== "skipped"
	) {
		return undefined;
	}
	return { name: value.name, status: value.status };
}

function agentCiJobToRunJob(job: AgentCiRunResultJobEntry): JobResult {
	return {
		name: job.name,
		status: agentCiStatusToRunStatus(job.status),
		steps: job.steps?.map(agentCiStepToRunStep) ?? [],
	};
}

function agentCiStepToRunStep(step: AgentCiRunResultStepEntry): StepResult {
	return {
		name: step.name,
		status: agentCiStatusToRunStatus(step.status),
	};
}

function agentCiStatusToRunStatus(
	status: "passed" | "failed" | "skipped" | undefined,
): RunStatus {
	if (status === "passed") {
		return RunStatus.Success;
	}
	if (status === "failed") {
		return RunStatus.Failure;
	}
	return RunStatus.Unknown;
}

function toAgentCiRunError(
	error: unknown,
	binary: AgentCiBinaryResolution,
): unknown {
	if (!isNodeError(error)) {
		return error;
	}
	if (error.code === "ENOENT") {
		return new PretendActError(agentCiBinaryMissingMessage(binary), {
			code: "PRETEND_ACT_AGENT_CI_BINARY_MISSING",
			cause: error,
		});
	}
	if (error.code === "EACCES") {
		return new PretendActError(
			`Agent CI binary is not executable: ${binary.command}. Check file permissions or set AGENT_CI_BINARY to an executable agent-ci binary.`,
			{ code: "PRETEND_ACT_AGENT_CI_BINARY_NOT_EXECUTABLE", cause: error },
		);
	}
	return error;
}

function agentCiBinaryMissingMessage(binary: AgentCiBinaryResolution): string {
	if (binary.source === "explicit") {
		return `Agent CI binary was not found: ${binary.command}. Check the agentCiBinary option, or install @redwoodjs/agent-ci and omit agentCiBinary to use its package bin.`;
	}
	if (binary.source === "environment") {
		return `Agent CI binary from AGENT_CI_BINARY was not found: ${binary.command}. Check AGENT_CI_BINARY, or install @redwoodjs/agent-ci and unset AGENT_CI_BINARY to use its package bin.`;
	}
	return "Agent CI binary was not found. Install optional peer @redwoodjs/agent-ci, add agent-ci to PATH, set AGENT_CI_BINARY, or pass the agentCiBinary option.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
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
